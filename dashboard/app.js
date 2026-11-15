// LaunchScope's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, its filters, a per-protocol detail view with the model's own arithmetic and the
// protocol's farm plan, and the set of protocols whose token already trades. No network: every byte
// it shows is in data.js, and the farm plan and implied value it prints are recomputed here from the
// same figures main.ts scored, so the page and board.json cannot quietly disagree.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', segment: 'all', tab: 'pre', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0'); }

  // The model in one line: the page multiplies the row's own rounded factors in the model's order
  // and checks the product against the number board.json carries.
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * row.growth_multiplier * row.maturity_multiplier * row.breadth_multiplier));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, first chain, TVL
  // and age decide the actions, the capital, the gas and the hold. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return 7;
    if (c === 'solana') return 0.1;
    if (c === 'bsc' || c === 'binance') return 0.35;
    if (c.indexOf('arbitrum') >= 0 || c.indexOf('base') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('zksync') >= 0 || c.indexOf('linea') >= 0 || c.indexOf('scroll') >= 0 || c.indexOf('blast') >= 0 || c.indexOf('mantle') >= 0 || c.indexOf('mode') >= 0) return 0.4;
    if (c.indexOf('polygon') >= 0 || c.indexOf('avalanche') >= 0 || c.indexOf('fantom') >= 0 || c.indexOf('sonic') >= 0 || c.indexOf('gnosis') >= 0 || c.indexOf('celo') >= 0 || c.indexOf('moonbeam') >= 0) return 0.6;
    return 1.5;
  }
  function gasText(d) { return d < 1 ? 'about ' + Math.round(d * 100) + ' cents' : 'about $' + d.toFixed(d % 1 === 0 ? 0 : 2); }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 500;
    if (p.tvl_usd >= 1e9) return 300;
    if (p.tvl_usd >= 2.5e8) return 200;
    if (p.tvl_usd >= 5e7) return 100;
    if (p.tvl_usd >= 1e7) return 75;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 60;
    if (age < 180) return 90;
    if (age < 365) return 60;
    if (age < 730) return 45;
    return 30;
  }
  function primaryAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC or ETH to ' + name + ' on ' + chain + ' as collateral and leave it supplied.';
    if (c.indexOf('dex') >= 0) return 'Add $' + capital + " of liquidity to " + name + "'s deepest USDC pair on " + chain + ' and keep the LP position open.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Allocate $' + capital + ' to a ' + name + ' curated vault on ' + chain + ' and keep the vault shares in the wallet.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC from Ethereum to ' + chain + ' through ' + name + ' and hold the bridged funds there.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small position hedged against the market.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + " and take one position in " + name + "'s most liquid market.";
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the staking asset through ' + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('rwa') >= 0) return 'Subscribe $' + capital + ' to ' + name + "'s yield asset on " + chain + ' and hold it through one distribution cycle.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of protocol cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' to ' + name + " and hold it in the wallet as the chain's native asset.";
    if (c.indexOf('launchpad') >= 0) return 'Commit $' + capital + ' toward one ' + name + ' launch on ' + chain + ' and complete its participation steps.';
    if (c.indexOf('stable') >= 0 || c.indexOf('algo') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold the balance.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    return 'Deposit $' + capital + " of USDC into " + name + "'s core product on " + chain + ' and keep the position open.';
  }
  function secondAction(p, capital) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow about $' + Math.round(capital * 0.4) + ' of a second asset against the supply, hold it a week, then repay: borrowing is the action points programs weight most.';
    if (c.indexOf('dex') >= 0) return 'Route two swaps a week of about $' + Math.max(25, Math.round(capital * 0.2)) + ' each through ' + name + ' so the wallet builds real trading volume, not just liquidity.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Split a second $' + Math.round(capital * 0.5) + ' into a different ' + name + ' vault on a second chain it curates, so the account is active in more than one market.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a smaller $' + Math.max(25, Math.round(capital * 0.3)) + ' back the other way once a month: round trips are what bridge activity programs count.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Trade about $' + capital * 2 + ' of total volume across the hold in small hedged orders, the metric derivatives programs publish for their seasons.';
    if (c.indexOf('prediction') >= 0) return 'Take one position a week in a different market each time; breadth of markets is what prediction programs record.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake or delegate a second $' + Math.round(capital * 0.5) + ' with a different operator or vault so the stake is not a single passive deposit.';
    if (c.indexOf('rwa') >= 0) return 'Hold the asset past one full distribution and reinvest the payout once, so the account shows a complete cycle.';
    if (c.indexOf('chain') >= 0) return 'Make one native transfer and one contract interaction a week on ' + name + ': raw transaction count is the first metric a new chain publishes.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Compound the yield back into the vault once a week instead of withdrawing it, so the position grows on the record.';
    return 'Use a second feature of ' + name + ' once a week, such as a swap, a vote or a smaller second deposit, so the account reads as a user rather than one deposit.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var gas = gasFor(chain);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var sizeNote = p.tvl_usd >= DATA.floor_usd ? 'above the watchlist floor' : 'below the watchlist floor';
    return [
      { text: 'Set up a fresh wallet for ' + p.name + ' alone, fund it from an exchange, and keep its seed phrase offline; one wallet per protocol keeps every farm separable.', cost: gasText(gas) + ' of gas for the first transaction on ' + chain, time: '10 minutes' },
      { text: primaryAction(p, capital, chain), cost: '$' + capital + ' of capital and ' + gasText(gas) + ' of gas', time: '15 minutes to set up' },
      { text: secondAction(p, capital), cost: gasText(gas * 2) + ' of gas across the two actions', time: '20 minutes' },
      { text: 'Repeat one qualifying action every week without missing a week: protocols of this size (' + sizeNote + ') usually score seasons or points on weekly streaks, and a gap resets them.', cost: gasText(gas) + ' of gas a week, about $' + Math.max(1, Math.round(gas * 4)) + ' a month', time: '10 minutes a week' },
      { text: 'Hold the position at least ' + hold + ' days, spanning two monthly snapshots of the protocol\'s TVL, before judging it: shorter holds are the ones activity filters discard.', cost: 'the $' + capital + ' stays in the position and cannot be spent elsewhere', time: hold + ' days' },
      { text: 'Check ' + p.name + '\'s official announcements and points page once a week for a token or season announcement; claim only from a link the protocol itself publishes, and never pay a fee to claim.', cost: 'nothing to check; a claim that asks for payment is a scam', time: '5 minutes a week' },
      { text: 'Log the wallet, every date, amount and transaction hash in a farm log; when a token launches or the ' + hold + ' days pass with no announcement, unwind in one session and record the result.', cost: gasText(gas * 2) + ' of gas to unwind', time: '15 minutes to exit' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    ['q', 'category', 'chain', 'segment', 'tab', 'sort'].forEach(function (k) { if (params.get(k)) state[k] = params.get(k); });
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('dir')) state.dir = Number(params.get('dir')) < 0 ? -1 : 1;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.segment !== 'all') params.set('segment', state.segment);
    if (state.tab !== 'pre') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.segment === 'watchlist' && !r.watchlist) return false;
      if (state.segment === 'early' && r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', { class: 'brand-name' }, 'Launch', el('em', { text: 'Scope' }))
      ),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Universe ', el('b', { text: String(DATA.protocols_size) + ' protocols' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var covered = DATA.rows.filter(function (r) { return r.watchlist; }).length;
    var values = DATA.rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    var median = values.length ? values[Math.floor(values.length / 2)] : 0;
    var total = values.reduce(function (n, v) { return n + v; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, 'Every protocol with ', el('span', { class: 'hl', text: 'no token yet' }), ', ranked by what its launch would be worth'),
        el('p', null,
          'The board ranks ', el('b', { text: String(DATA.board_size) }), ' pre-token protocols: the whole ',
          el('b', { text: String(DATA.watchlist_size) }), '-protocol watchlist (at least ', el('b', { text: fmtUsd(DATA.floor_usd) }),
          ' of TVL, no token on record) plus ', el('b', { text: String(DATA.early_size) }),
          ' earlier finds below that floor. Each implied value is calibrated from the snapshot itself: what the market already pays, per dollar of TVL, for the tokens that do trade. An implied value is a model\'s claim, not a price and not a promise that a token comes.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: covered + ' / ' + DATA.watchlist_size }), el('small', { text: 'the floor, fully ranked' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' below the floor' })),
        el('div', { class: 'fact' }, el('span', { text: 'Median implied value' }), el('b', { text: fmtUsd(median) }), el('small', { text: 'total ' + fmtUsd(total) + ' across the board' })),
        el('div', { class: 'fact' }, el('span', { text: 'Already trading' }), el('b', { text: String(DATA.live_total) }), el('small', { text: 'set aside, market caps shown' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a] || (a < b ? -1 : 1); }).slice(0, 16);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, values, current, onchange) {
      var s = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: label }),
        values.map(function (v) { return el('option', { value: v, text: v, selected: v === current ? 'selected' : null }); })
      );
      s.addEventListener('change', function () { onchange(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    function segButton(value, label) {
      return el('button', { type: 'button', 'aria-pressed': state.segment === value ? 'true' : 'false', text: label, onclick: function () { state.segment = value; writeHash(); render(); } });
    }
    function tabButton(value, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === value ? 'true' : 'false', text: label, onclick: function () { state.tab = value; render(); } });
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'All categories', categories, state.category, function (v) { state.category = v; }),
      select('chain', 'All chains', chains, state.chain, function (v) { state.chain = v; }),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Radar' }),
        el('div', { class: 'segments' }, segButton('all', 'Full board'), segButton('watchlist', 'Watchlist only'), segButton('early', 'Early finds'))),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }),
        el('div', { class: 'tabs' }, tabButton('pre', 'Pre-token'), tabButton('live', 'Already trading'))),
      el('span', { class: 'count', text: state.tab === 'pre' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' of ' + DATA.live_total + ' live-token protocols' })
    );
  }

  function sortHeader(key, label, numeric) {
    return el('th', { scope: 'col', class: numeric ? 'num' : null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function signalChip(r) {
    var cls = r.signal === 'Strong' ? 'strong' : r.signal === 'Building' ? 'building' : 'early';
    return el('span', { class: 'chip ' + cls, text: r.signal });
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the filters to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.segment = 'all'; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? 'flat' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'chain unrecorded') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, signalChip(r)),
        el('td', null, r.watchlist ? el('span', { class: 'chip watch', text: 'Watchlist' }) : el('span', { class: 'chip early', text: 'Early' })),
        el('td', { class: 'num' }, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        ))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols ranked by implied value. The signal counts the launch case in the record itself: size, growth, a year or more with no token, breadth across chains. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', true),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL', true),
            sortHeader('growth', '7d', true),
            sortHeader('age', 'Age', true),
            el('th', { scope: 'col', text: 'Signal' }),
            el('th', { scope: 'col', text: 'Radar' }),
            sortHeader('implied', 'Implied value', true)
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'chip live', text: r.symbol || 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'chain unrecorded') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_usd && r.tvl_usd ? 'x' + (r.mcap_usd / r.tvl_usd).toFixed(3) : 'n/a' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Already trading: these protocols have a token, so their market cap is a fact, not a model. They are never ranked with the pre-token board; they are the witnesses its multiples are calibrated from. The ' + DATA.live_total + ' live-token protocols are summarised by the ' + DATA.live.length + ' largest here.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Token' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Cap / TVL' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var cal = DATA.calibration;
    var topCats = cal.categories.slice(0, 10);
    var catBody = el('tbody');
    topCats.forEach(function (c) {
      catBody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.samples) }),
        el('td', { class: 'num', text: 'x' + c.median.toFixed(3) }),
        el('td', { class: 'num', text: 'x' + c.used.toFixed(3) })
      ));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How the implied value is calibrated' }),
      el('p', null,
        'No multiple on this board was picked by hand. The ', el('b', { text: String(cal.market_samples) }),
        ' protocols in the snapshot whose tokens already trade and report a market cap are the evidence: their market-cap-to-TVL ratios have a median of ',
        el('b', { text: 'x' + cal.market_multiple.toFixed(3) }), ', and each category with live tokens gets its own median, shrunk toward the market median by its sample size (weight ',
        el('b', { text: String(m.shrink_k) }), '), so a category with two live tokens barely moves and one with twenty speaks for itself. Exchange records are left out: an exchange\'s TVL is customer balances, not a product the market prices.'
      ),
      el('div', { class: 'formula', text: 'implied = round( tvl x multiple(category) x (1 + clamp(7d change, ' + m.growth_floor_pct + ', ' + m.growth_cap_pct + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_base + ' + ' + m.maturity_span + ' x (1 - exp(-age_days / ' + m.maturity_tau_days + '))) x (1 + ' + m.breadth_per_chain + ' x min(chains - 1, ' + m.breadth_max_extra_chains + ')) )' }),
      el('div', { class: 'cols' },
        el('div', null,
          el('h3', { text: 'The four factors' }),
          el('ul', null,
            el('li', null, el('b', { text: 'TVL x multiple. ' }), 'Size, priced the way the market prices the same category today.'),
            el('li', null, el('b', { text: 'Growth. ' }), 'Seven-day TVL change, clamped so one wild week cannot carry a ranking; a shrinking protocol is marked down, never out.'),
            el('li', null, el('b', { text: 'Maturity. ' }), 'Days since the protocol was first tracked: how long it has run with no token. The lift saturates near two years; an unrecorded age uses the ranked protocols\' median, ' + cal.fallback_age_days + ' days.'),
            el('li', null, el('b', { text: 'Breadth. ' }), 'A small lift per extra chain: wider deployment is wider distribution when a token comes.')
          )
        ),
        el('div', null,
          el('h3', { text: 'What the board is not' }),
          el('ul', null,
            el('li', null, 'Not a prediction that any protocol issues a token, or when: the value is what a launch would be worth if the record stayed as it is.'),
            el('li', null, 'Not a list of names anyone chose: one function scores every row from the snapshot\'s figures, and every row\'s detail view shows its arithmetic.'),
            el('li', null, 'A protocol is said to record no token, never to have none: a record can lag a launch, and wrapped or staked products of trading tokens are excluded by rule, not by eye.')
          )
        )
      ),
      el('h3', { text: 'Category multiples from this snapshot (top 10 by live sample)' }),
      el('table', null,
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Live tokens' }), el('th', { scope: 'col', class: 'num', text: 'Median cap/TVL' }), el('th', { scope: 'col', class: 'num', text: 'Multiple used' }))),
        catBody
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function factorCell(label, value, note) {
    return el('div', null, el('span', { text: label }), el('b', { class: 'num', text: value }), note ? el('span', { text: note }) : null);
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.watchlist ? 'Watchlist' : 'Early find') + ' · signal ' + row.signal }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorised') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'chain unrecorded') + ' · tracked since ' + (row.listed_at || 'an unrecorded date') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value, factor by factor' }),
      el('div', { class: 'equation' },
        factorCell('TVL', fmtUsd(row.tvl_usd)),
        factorCell('Category multiple', fmtMult(row.multiple), 'calibrated'),
        factorCell('Growth x', fmtMult(row.growth_multiplier), '7d ' + fmtPct(row.change_7d)),
        factorCell('Maturity x', fmtMult(row.maturity_multiplier), 'age ' + fmtAge(row.age_days)),
        factorCell('Breadth x', fmtMult(row.breadth_multiplier), (row.chains || []).length + ' chains'),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'note', text: 'Model ' + DATA.model_version + ': the page recomputes this row from the same figures as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' The multiple is the ' + (row.category || 'Uncategorised') + ' category\'s, calibrated from the live tokens in the snapshot and shrunk toward the market median of x' + DATA.calibration.market_multiple.toFixed(3) + '. An estimate of what a launch would be worth on today\'s record, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('div', { class: 'tags' },
        el('span', { class: 'chip ' + (row.signal === 'Strong' ? 'strong' : row.signal === 'Building' ? 'building' : 'early'), text: 'Signal: ' + row.signal }),
        el('span', { class: 'chip', text: 'Records no token' }),
        el('span', { class: 'chip', text: row.watchlist ? 'On the snapshot watchlist' : 'Below the watchlist floor' })
      )
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre' ? boardTable() : liveTable());
    if (state.tab === 'pre') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'foot' },
      el('b', { text: 'Reading this board. ' }),
      'Implied value is LaunchScope\'s own model output on a sealed DefiLlama snapshot of ' + DATA.as_of + '; it ranks protocols that record no token by what a token would be worth if their record stayed as it is. It is not investment advice, not a price, and not a claim that any protocol will issue a token. Farm plans are checklists of public product actions with their costs; a protocol\'s own terms govern any program it runs.'
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
