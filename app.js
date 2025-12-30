(() => {
  const VERSION = 2;
  const GAME_ID = 'L8';
  const N = 4;
  const L = 2 * N;        // 8
  const MAX_TRIES = 6;

  // ✅ End-game modal timing (ms)
  const END_MODAL_DELAY_WIN = 2100;   // confetti first
  const END_MODAL_DELAY_LOSE = 1800;  // avoid jumpscare
  const END_MODAL_DELAY_LOAD = 650;   // refresh/reopen

  const LS_STATS_KEY = `brackle_stats_v${VERSION}`;
  const LS_DAY_PREFIX = `brackle_day_v${VERSION}_${GAME_ID}_`;

  const $app = document.getElementById('app');
  const $submit = document.getElementById('submit');
  const $toggleView = document.getElementById('toggleView');
  const $msg = document.getElementById('msg');
  const $board = document.getElementById('board');

  const $keyL = document.getElementById('keyL');
  const $keyR = document.getElementById('keyR');
  const $keyS = document.getElementById('keyS');
  const $keyBk = document.getElementById('keyBk');

  const $matchPill = document.getElementById('matchPill');
  const $matchCount = document.getElementById('matchCount');
  const $matchTotal = document.getElementById('matchTotal');
  $matchTotal.textContent = String(L);
  document.documentElement.style.setProperty('--cols', String(L));

  // modal
  const $modal = document.getElementById('modal');
  const $modalCard = document.getElementById('modalCard');
  const $closeModal = document.getElementById('closeModal');
  const $openStats = document.getElementById('openStats');
  const $shareBtn = document.getElementById('shareBtn');
  const $countdown = document.getElementById('countdown');
  const $dist = document.getElementById('dist');

  const $sPlayed = document.getElementById('sPlayed');
  const $sWinPct = document.getElementById('sWinPct');
  const $sCurStreak = document.getElementById('sCurStreak');
  const $sMaxStreak = document.getElementById('sMaxStreak');

  // ✅ iOS Safari fallback: prevent double-tap zoom (keeps pinch-zoom)
  (function preventDoubleTapZoom(){
    document.addEventListener('dblclick', (e) => e.preventDefault());
  })();

  function safeLSGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeLSSet(key, val) {
    try { localStorage.setItem(key, val); } catch {}
  }

  function pad2(n){ return String(n).padStart(2,'0'); }

  function todayKeyUTC() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    return `${y}-${pad2(m)}-${pad2(dd)}`;
  }

  function dateAddDaysUTC(yyyy_mm_dd, delta) {
    const [y,m,dd] = yyyy_mm_dd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m-1, dd));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth()+1)}-${pad2(dt.getUTCDate())}`;
  }

  function dateAddDays(yyyy_mm_dd, delta) {
    const [y,m,dd] = yyyy_mm_dd.split('-').map(Number);
    const dt = new Date(y, m-1, dd);
    dt.setDate(dt.getDate() + delta);
    return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
  }

  function nextMidnightMsUTC() {
    const now = new Date();
    const nxt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0,0,0,0);
    return nxt;
  }

  function formatHHMMSS(ms) {
    if (ms <= 0) return '00:00:00';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  function allMotzkinWords(len, maxH) {
    const res = [];
    function dfs(pos, h, s) {
      if (pos === len) {
        if (h === 0) res.push(s);
        return;
      }
      // after placing a char at this position, we must still be able to return to 0
      // because the height can decrease by at most 1 per remaining step.
      const remainingAfter = len - (pos + 1);

      // '(' : up
      {
        const h2 = h + 1;
        if (h2 <= maxH && h2 <= remainingAfter) dfs(pos + 1, h2, s + '(');
      }

      // '*' : flat
      {
        const h2 = h;
        if (h2 <= remainingAfter) dfs(pos + 1, h2, s + '*');
      }

      // ')' : down
      if (h > 0) {
        const h2 = h - 1;
        if (h2 <= remainingAfter) dfs(pos + 1, h2, s + ')');
      }
    }
    dfs(0, 0, '');
    return res;
  }

  // ✅ 排除过于“无聊 / 太平”的答案：全是 *，或只有一对括号，其它全是 *，以及默认首猜型
  function isBoringAnswer(w) {
    let open = 0;
    for (let i = 0; i < w.length; i++) if (w[i] === '(') open++;
    if (open === 0) return true;  // ********
    if (open === 1) return true;  // one pair only
    if (w === '()()()()') return true; // common default
    return false;
  }

  const DICT = allMotzkinWords(L, N).filter(w => !isBoringAnswer(w));

  function hash32(str){
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0);
  }

  function dailyAnswer(dateStr){
    const idx = hash32('BRACKLE|' + dateStr) % DICT.length;
    return DICT[idx];
  }

  function balances(s) {
    const b = [];
    let bal = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '(') bal += 1;
      else if (ch === ')') bal -= 1;
      else bal += 0; // '*'
      b.push(bal);
    }
    return b;
  }

  function isValidDyck(s) {
    if (s.length !== L) return { ok: false, why: `Length must be ${L}.` };
    if (!/^[()*]+$/.test(s)) return { ok: false, why: 'Only (, ), and * are allowed.' };

    let bal = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '(') bal += 1;
      else if (ch === ')') bal -= 1;
      else bal += 0; // '*'

      const remaining = L - (i + 1);

      if (bal < 0) return { ok: false, why: `Check the prefix height at position ${i+1}.` };
      if (bal > N) return { ok: false, why: `Prefix height exceeds ${N} at position ${i+1}.` };
      if (bal > remaining) return { ok: false, why: `Too high to finish by position ${i+1}.` };
    }

    if (bal !== 0) return { ok: false, why: 'Final height must return to 0.' };
    return { ok: true, why: '' };
  }

  function colorClassForDiff(diff) {
    if (diff === 0) return 'g';
    if (diff <= 2) return 'y';
    return 'x';
  }
  function labelForClass(cls) {
    if (cls === 'g') return 'Hit';
    if (cls === 'y') return 'Off by 1–2';
    return 'Off by ≥3';
  }

  function countMatches(gBal, ansBal) {
    let c = 0;
    for (let i = 0; i < L; i++) if (gBal[i] === ansBal[i]) c++;
    return c;
  }

  function setMsg(text, ok=false) {
    $msg.textContent = text || '';
    $msg.className = ok ? 'msg ok' : 'msg';
  }

  function setMatchPill(valueOrNull) {
    if (valueOrNull === null) {
      $matchCount.textContent = '—';
      $matchPill.classList.add('dim');
      return;
    }
    $matchCount.textContent = String(valueOrNull);
    $matchPill.classList.remove('dim');
  }

  function focusGame() {
    if (modalOpen) return;
    $app.focus({ preventScroll: true });
  }

  // ✅ 自适应：不只手机端，任何宽度不够都缩格子（极窄才滚动）
  function fitCellsToBoard() {
    const boardW = $board.clientWidth || 0;
    if (boardW <= 0) return;

    const usable = Math.max(0, boardW - 2);

    const DEFAULT_CELL = 46;
    const DEFAULT_GAP = 8;
    const requiredDefault = L * DEFAULT_CELL + (L - 1) * DEFAULT_GAP;

    // ✅ 你要的“Wordle味”：gap 固定住（不要被 JS 算到太小）
    //  - 窄屏/手机：固定 6px（和 CSS 的 mobile 断点一致）
    //  - 其他：保持 8px
    const FILL_MAX_USABLE = 560;            // 视为“窄屏/手机”的上限宽度
    const FIXED_GAP = (usable <= FILL_MAX_USABLE) ? 6 : DEFAULT_GAP;

    const MIN_CELL = 26;                   // 再窄就允许横向滚动（不牺牲 gap）
    const MAX_FILL_CELL = 58;              // 防止在小平板上变得太大
    const MAX_SHRINK_CELL = 44;            // 宽度不够时，最多缩到这个大小

    // ✅ 情况 1：默认尺寸已经能放下
    //  - 窄屏：用固定 gap 把格子轻微拉伸到“刚好撑满”
    //  - 宽屏：保持默认（别变太大）
    if (requiredDefault <= usable) {
      if (usable <= FILL_MAX_USABLE) {
        let cell = (usable - (L - 1) * FIXED_GAP) / L;
        // “够宽”的情况下，不允许比默认更小
        cell = Math.max(DEFAULT_CELL, cell);
        cell = Math.min(MAX_FILL_CELL, cell);

        const cellPx = Math.round(cell * 10) / 10;
        document.documentElement.style.setProperty('--cell', cellPx + 'px');
        document.documentElement.style.setProperty('--gap', FIXED_GAP + 'px');
        return;
      }

      document.documentElement.style.setProperty('--cell', DEFAULT_CELL + 'px');
      document.documentElement.style.setProperty('--gap', DEFAULT_GAP + 'px');
      return;
    }

    // ✅ 情况 2：默认尺寸放不下
    //  - gap 仍然固定（不牺牲间距），优先缩 cell
    //  - 如果 cell 已经小于阈值，就改为横向滚动
    let cell = (usable - (L - 1) * FIXED_GAP) / L;

    if (cell >= MIN_CELL) {
      cell = Math.min(MAX_SHRINK_CELL, cell);
      const cellPx = Math.round(cell * 10) / 10;
      document.documentElement.style.setProperty('--cell', cellPx + 'px');
      document.documentElement.style.setProperty('--gap', FIXED_GAP + 'px');
      return;
    }

    // 极端窄：保持 gap，cell 用最小值，剩下的交给滚动条
    document.documentElement.style.setProperty('--cell', MIN_CELL + 'px');
    document.documentElement.style.setProperty('--gap', FIXED_GAP + 'px');
  }

  function updateBoardAlign() {
    const row = $board.querySelector('.row');
    if (!row) return;
    const needScroll = row.scrollWidth > $board.clientWidth + 1;
    $board.classList.toggle('scrolling', needScroll);
  }

  // ✅ Global stats
  function defaultStats() {
    return {
      played: 0,
      wins: 0,
      currentStreak: 0,
      maxStreak: 0,
      lastPlayedDate: null,
      lastResultWasWin: false,
      dist: { "1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"X":0 }
    };
  }

  function loadStats() {
    const raw = safeLSGet(LS_STATS_KEY);
    if (!raw) return defaultStats();
    try {
      const s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return defaultStats();
      if (!s.dist) s.dist = { "1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"X":0 };
      for (const k of ["1","2","3","4","5","6","X"]) if (typeof s.dist[k] !== 'number') s.dist[k] = 0;
      for (const k of ["played","wins","currentStreak","maxStreak"]) if (typeof s[k] !== 'number') s[k] = 0;
      if (typeof s.lastPlayedDate !== 'string') s.lastPlayedDate = null;
      if (typeof s.lastResultWasWin !== 'boolean') s.lastResultWasWin = false;
      return s;
    } catch {
      return defaultStats();
    }
  }

  function saveStats(stats) {
    safeLSSet(LS_STATS_KEY, JSON.stringify(stats));
  }

  // ✅ Day state
  function dayStorageKey(dateStr){ return LS_DAY_PREFIX + dateStr; }

  function defaultDayState(dateStr) {
    return {
      date: dateStr,
      rounds: [],
      activeGuess: '',
      awaitingReveal: false,
      done: false,
      won: false,
      tries: 0,
      showBalance: false,
      matchValue: null,
      recorded: false
    };
  }

  function loadDayState(dateStr) {
    const raw = safeLSGet(dayStorageKey(dateStr));
    if (!raw) return defaultDayState(dateStr);
    try {
      const st = JSON.parse(raw);
      if (!st || st.date !== dateStr) return defaultDayState(dateStr);

      if (!Array.isArray(st.rounds)) st.rounds = [];
      if (typeof st.activeGuess !== 'string') st.activeGuess = '';
      if (typeof st.awaitingReveal !== 'boolean') st.awaitingReveal = false;
      if (typeof st.done !== 'boolean') st.done = false;
      if (typeof st.won !== 'boolean') st.won = false;
      if (typeof st.tries !== 'number') st.tries = st.rounds.length;
      if (typeof st.showBalance !== 'boolean') st.showBalance = false;
      if (!(typeof st.matchValue === 'number' || st.matchValue === null)) st.matchValue = null;
      if (typeof st.recorded !== 'boolean') st.recorded = false;

      st.rounds = st.rounds.slice(0, MAX_TRIES).map(r => {
        const guess = (r && typeof r.guess === 'string') ? r.guess.slice(0, L) : '';
        const gBal = Array.isArray(r && r.gBal) ? r.gBal.slice(0, L).map(x => Number(x)) : (guess.length === L ? balances(guess) : Array(L).fill(0));
        const revealed = Array.isArray(r && r.revealed) ? r.revealed.slice(0, L).map(x => (x === 'g' || x === 'y' || x === 'x') ? x : null) : Array(L).fill(null);
        return { guess, gBal, revealed };
      });

      st.tries = st.rounds.length;
      return st;
    } catch {
      return defaultDayState(dateStr);
    }
  }

  function saveDayState() {
    const st = {
      date: today,
      rounds,
      activeGuess,
      awaitingReveal,
      done,
      won,
      tries,
      showBalance,
      matchValue,
      recorded
    };
    safeLSSet(dayStorageKey(today), JSON.stringify(st));
  }

  // ✅ Modal control
  let modalOpen = false;

  function openModal() {
    modalOpen = true;
    $modal.classList.remove('hidden');
    $shareBtn.disabled = !done;
    focusModal();
  }

  function closeModal() {
    modalOpen = false;
    $modal.classList.add('hidden');
    focusGame();
    render();
  }

  function focusModal() {
    $closeModal.focus({ preventScroll: true });
  }

  function renderStatsModal() {
    const stats = loadStats();

    const played = stats.played || 0;
    const wins = stats.wins || 0;
    const winPct = played === 0 ? 0 : Math.round((wins / played) * 100);

    $sPlayed.textContent = String(played);
    $sWinPct.textContent = String(winPct);
    $sCurStreak.textContent = String(stats.currentStreak || 0);
    $sMaxStreak.textContent = String(stats.maxStreak || 0);

    let todayKeyBar = null;
    let todayBarClass = null;
    if (done) {
      if (won) { todayKeyBar = String(tries); todayBarClass = 'todayWin'; }
      else { todayKeyBar = 'X'; todayBarClass = 'todayLose'; }
    }

    const dist = stats.dist || { "1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"X":0 };
    const keys = ["1","2","3","4","5","6"];
    const showX = (dist["X"] || 0) > 0 || todayKeyBar === 'X';

    const maxVal = Math.max(
      1,
      ...keys.map(k => dist[k] || 0),
      showX ? (dist["X"] || 0) : 0
    );

    $dist.innerHTML = '';

    function addRow(k, count) {
      const row = document.createElement('div');
      row.className = 'distRow';

      const key = document.createElement('div');
      key.className = 'distKey';
      key.textContent = k;

      const bar = document.createElement('div');
      bar.className = 'distBar';

      const fill = document.createElement('div');
      fill.className = 'distFill';

      let pct = (count / maxVal) * 100;
      if (count === 0) {
        // ✅ 0：平时保持“空”，但如果今天正好是这一行（比如 X），也要能被高亮看到
        fill.classList.add('zero');
        pct = (todayKeyBar === k) ? 10 : 0;
      } else {
        pct = Math.max(10, pct);
      }
      pct = Math.min(100, pct);
      fill.style.width = pct + '%';

      if (todayKeyBar === k) {
        fill.classList.add(todayBarClass);
        fill.classList.remove('zero');
      }

      fill.textContent = String(count);

      bar.appendChild(fill);
      row.appendChild(key);
      row.appendChild(bar);
      $dist.appendChild(row);
    }

    for (const k of keys) addRow(k, dist[k] || 0);
    if (showX) addRow('X', dist['X'] || 0);
  }

  let countdownTimer = null;
  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    function tick() {
      const ms = nextMidnightMsUTC() - Date.now();
      $countdown.textContent = formatHHMMSS(ms);
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  }

  // ✅ Confetti (win only)
  const $confetti = document.getElementById('confetti');
  function launchConfetti(durationMs = 1800) {
    if (!$confetti) return;
    $confetti.innerHTML = '';
    $confetti.style.display = 'block';

    const colors = [
      getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#6aaa64',
      getComputedStyle(document.documentElement).getPropertyValue('--yellow').trim() || '#c9b458',
      getComputedStyle(document.documentElement).getPropertyValue('--gray').trim() || '#787c7e',
      '#b4a7d6', '#66c2a5', '#fc8d62'
    ];

    const W = window.innerWidth;
    const count = Math.min(100, Math.max(55, Math.floor(W / 10)));

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';

      const left = Math.random() * 100;
      const dx = (Math.random() * 2 - 1) * 140;
      const rot = 540 + Math.random() * 720;
      const dur = 1400 + Math.random() * 900;
      const delay = Math.random() * 200;
      const w = 8 + Math.random() * 6;
      const h = 10 + Math.random() * 10;

      p.style.left = left + 'vw';
      p.style.width = w + 'px';
      p.style.height = h + 'px';
      p.style.background = colors[(Math.random() * colors.length) | 0];
      p.style.setProperty('--dx', dx.toFixed(0) + 'px');
      p.style.setProperty('--rot', rot.toFixed(0) + 'deg');
      p.style.animationDuration = dur.toFixed(0) + 'ms';
      p.style.animationDelay = delay.toFixed(0) + 'ms';

      $confetti.appendChild(p);
    }

    window.setTimeout(() => {
      $confetti.style.display = 'none';
      $confetti.innerHTML = '';
    }, durationMs);
  }

  let endModalScheduled = false;
  function scheduleEndModal(isWin, fromLoad = false) {
    if (endModalScheduled) return;
    endModalScheduled = true;

    const delay = fromLoad ? END_MODAL_DELAY_LOAD : (isWin ? END_MODAL_DELAY_WIN : END_MODAL_DELAY_LOSE);

    if (!fromLoad && isWin) {
      launchConfetti(Math.max(1200, delay - 250));
    }

    window.setTimeout(() => {
      renderStatsModal();
      openModal();
    }, delay);
  }

  function emojiForDiff(diff){
    if (diff === 0) return '🟩';
    if (diff <= 2) return '🟨';
    return '⬛';
  }

  function makeShareText() {
    const dateCompact = today.replace(/-/g, '');
    const result = won ? `${tries}/${MAX_TRIES}` : `X/${MAX_TRIES}`;
    const hits = rounds.map(rr => countMatches(rr.gBal, ansBal)).join(' → ');
    const base = `${location.origin}${location.pathname}`.replace(/\/$/, '');

    return `BRACKLE ${dateCompact} ${result}

${hits}
@brackle ${base}`;
  }

  function updateStatsIfNeeded() {
    if (!done) return;
    if (recorded) return;

    const stats = loadStats();
    const resultKey = won ? String(tries) : 'X';

    if (stats.lastPlayedDate === today) {
      recorded = true;
      saveDayState();
      return;
    }

    stats.played += 1;
    if (won) stats.wins += 1;

    if (!stats.dist) stats.dist = { "1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"X":0 };
    if (typeof stats.dist[resultKey] !== 'number') stats.dist[resultKey] = 0;
    stats.dist[resultKey] += 1;

    const yday = dateAddDaysUTC(today, -1);
    if (won) {
      if (stats.lastPlayedDate === yday && stats.lastResultWasWin === true) stats.currentStreak += 1;
      else stats.currentStreak = 1;
      stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
      stats.lastResultWasWin = true;
    } else {
      stats.currentStreak = 0;
      stats.lastResultWasWin = false;
    }

    stats.lastPlayedDate = today;
    saveStats(stats);

    recorded = true;
    saveDayState();
  }

  // ========= Game state (today) =========
  const today = todayKeyUTC();
  const answer = dailyAnswer(today);
  const ansBal = balances(answer);

  let st = loadDayState(today);

  let rounds = st.rounds;
  let activeGuess = st.activeGuess;
  let awaitingReveal = st.awaitingReveal;
  let done = st.done;
  let won = st.won;
  let tries = st.tries;
  let showBalance = st.showBalance;
  let matchValue = st.matchValue;
  let recorded = st.recorded;

  $toggleView.textContent = showBalance ? 'Bracket View' : 'Height View';

  function activeRowBalanceDisplay() {
    const out = Array(L).fill('');
    let bal = 0;
    let invalid = false;

    for (let i = 0; i < activeGuess.length; i++) {
      const ch = activeGuess[i];
      if (!invalid) {
        if (ch === '(') bal += 1;
        else if (ch === ')') bal -= 1;
        else bal += 0; // '*'
        const remaining = L - (i + 1);
        if (bal < 0 || bal > N || bal > remaining) invalid = true;
      }
      out[i] = invalid ? '-' : String(bal);
    }

    const cursor = activeGuess.length;
    if (cursor < L) out[cursor] = invalid ? '-' : String(bal);

    return out;
  }

  function render() {
    $board.innerHTML = '';

    const activeBalDisp = showBalance ? activeRowBalanceDisplay() : null;

    for (let r = 0; r < MAX_TRIES; r++) {
      const row = document.createElement('div');
      row.className = 'row';

      const isSubmitted = r < rounds.length;
      const isActiveRow = (!done && !awaitingReveal && r === rounds.length);

      const isFutureRow = (!done) && (awaitingReveal ? (r >= rounds.length) : (r > rounds.length));
      if (isFutureRow) row.classList.add('future');

      const guessStr = isSubmitted ? rounds[r].guess : (isActiveRow ? activeGuess : '');

      for (let i = 0; i < L; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';

        if (showBalance) {
          if (isSubmitted) cell.textContent = String(rounds[r].gBal[i]);
          else if (isActiveRow) cell.textContent = activeBalDisp[i] || '';
          else cell.textContent = '';
        } else {
          cell.textContent = guessStr[i] || '';
        }

        if (isActiveRow && i === activeGuess.length && activeGuess.length < L) {
          cell.classList.add('cursor');
        }

        if (isSubmitted) {
          const rr = rounds[r];
          if (done) {
            const diff = Math.abs(rr.gBal[i] - ansBal[i]);
            cell.classList.add(colorClassForDiff(diff));
          } else {
            const cls = rr.revealed[i];
            if (cls) cell.classList.add(cls);
          }
        }

        if (!modalOpen && !done && awaitingReveal && isSubmitted) {
          const rr = rounds[r];
          if (!rr.revealed[i]) {
            cell.classList.add('clickable');
            cell.title = 'Click to reveal this hint';
            cell.addEventListener('click', () => {
              if (modalOpen) return;
              if (!awaitingReveal || done) return;
              if (rr.revealed[i]) return;

              const diff = Math.abs(rr.gBal[i] - ansBal[i]);
              const cls = colorClassForDiff(diff);

              rr.revealed[i] = cls;

              awaitingReveal = false;
              saveDayState();

              setMsg(`Revealed row ${r+1}, col ${i+1}: ${labelForClass(cls)}.`, true);
              render();
              focusGame();
            });
          }
        }

        row.appendChild(cell);
      }

      $board.appendChild(row);
    }

    $submit.disabled = done || awaitingReveal || modalOpen;
    $toggleView.disabled = modalOpen;
    requestAnimationFrame(updateBoardAlign);
  }

  function toggleBalanceView() {
    if (modalOpen) return;
    showBalance = !showBalance;
    $toggleView.textContent = showBalance ? 'Bracket View' : 'Height View';
    saveDayState();
    render();
    focusGame();
  }

  function pushChar(ch) {
    if (modalOpen) return;
    if (done || awaitingReveal) return;
    if (activeGuess.length >= L) return;
    activeGuess += ch;
    setMsg('');
    saveDayState();
    render();
    focusGame();
  }

  function backspace() {
    if (modalOpen) return;
    if (done || awaitingReveal) return;
    if (activeGuess.length === 0) return;
    activeGuess = activeGuess.slice(0, -1);
    setMsg('');
    saveDayState();
    render();
    focusGame();
  }

  function submitGuess() {
    if (modalOpen) return;
    if (done) return;

    if (awaitingReveal) {
      setMsg('Reveal a hint first: click any submitted cell.');
      return;
    }

    if (tries >= MAX_TRIES) return;

    if (activeGuess.length !== L) {
      setMsg('Current row is not full.');
      return;
    }

    const v = isValidDyck(activeGuess);
    if (!v.ok) {
      setMsg(`Invalid input: ${v.why}`);
      return;
    }

    tries++;
    const gBal = balances(activeGuess);
    const rr = { guess: activeGuess, gBal, revealed: Array(L).fill(null) };
    rounds.push(rr);

    const matches = countMatches(gBal, ansBal);
    matchValue = matches;
    setMatchPill(matches);

    if (activeGuess === answer) {
      done = true;
      won = true;
      awaitingReveal = false;
      activeGuess = '';
      matchValue = L;
      setMatchPill(L);
      setMsg(`Solved in ${tries}.`, true);

      saveDayState();
      updateStatsIfNeeded();
      render();

      scheduleEndModal(true);
      return;
    }

    if (tries >= MAX_TRIES) {
      done = true;
      won = false;
      awaitingReveal = false;
      activeGuess = '';
      setMsg(`No more tries. Answer: ${answer}.`);

      saveDayState();
      updateStatsIfNeeded();
      render();

      scheduleEndModal(false);
      return;
    }

    awaitingReveal = true;
    activeGuess = '';
    setMsg('Not solved. Click any submitted cell to reveal a hint.');

    saveDayState();
    render();
    focusGame();
  }

  function onKeydown(e) {
    if (modalOpen) return;

    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggleBalanceView();
      return;
    }

    if (done) return;
    if (awaitingReveal) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      submitGuess();
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      backspace();
      return;
    }

    if (e.key === '(' || e.key === ')' || e.key === '*') {
      e.preventDefault();
      pushChar(e.key);
      return;
    }
  }

  function initUIFromState() {
    if (done && won) {
      setMatchPill(L);
    } else if (typeof matchValue === 'number') {
      setMatchPill(matchValue);
    } else if (rounds.length > 0) {
      const last = rounds[rounds.length - 1];
      const m = countMatches(last.gBal, ansBal);
      matchValue = m;
      setMatchPill(m);
    } else {
      setMatchPill(null);
    }

    if (done) {
      if (won) setMsg(`Completed: solved on guess ${tries}.`, true);
      else setMsg(`Completed: out of tries. Answer: ${answer}.`);
    } else if (awaitingReveal) {
      setMsg('Not solved. Click any submitted cell to reveal a hint.');
    } else {
      setMsg('');
    }

    fitCellsToBoard();
    render();
  }

  // ✅ resize / 旋转：重新计算 cell（覆盖“介于电脑和手机之间”的区间）
  let resizeRAF = null;
  window.addEventListener('resize', () => {
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      fitCellsToBoard();
      render();
    });
  });

  // Modal events
  $closeModal.addEventListener('click', () => closeModal());
  $modal.addEventListener('click', (e) => { if (e.target === $modal) closeModal(); });
  $modalCard.addEventListener('click', (e) => e.stopPropagation());

  $openStats.addEventListener('click', () => {
    renderStatsModal();
    openModal();
  });

  $shareBtn.addEventListener('click', async () => {
    if (!done) return;
    const text = makeShareText();
    const ok = await copyText(text);
    const old = $shareBtn.textContent;
    $shareBtn.disabled = true;
    $shareBtn.textContent = ok ? 'COPIED' : 'FAILED';
    setTimeout(() => {
      $shareBtn.textContent = old;
      $shareBtn.disabled = false;
      if (modalOpen) focusModal();
    }, 900);
  });

  // Game events
  window.addEventListener('keydown', onKeydown);
  $submit.addEventListener('click', () => { submitGuess(); focusGame(); });
  $toggleView.addEventListener('click', () => { toggleBalanceView(); });

  $keyL.addEventListener('click', () => pushChar('('));
  $keyR.addEventListener('click', () => pushChar(')'));
  $keyS.addEventListener('click', () => pushChar('*'));
  $keyBk.addEventListener('click', () => backspace());

  $app.addEventListener('mousedown', () => focusGame());

  // Start
  startCountdown();

  requestAnimationFrame(() => {
    initUIFromState();
    if (done) {
      updateStatsIfNeeded();
      // ✅ no jumpscare on refresh
      scheduleEndModal(won, true);
    }
  });
})();
