
// ── State ────────────────────────────────────────────────────────────
let socket = null;
let state = {
  running: false,
  prices: {},
  signals: {},
  trades: [],
  positions: {},
  movers: { gainers: [], losers: [] },
  wallet: {},
  selectedToken: null,
};
let eventLogLines = [];
const MAX_LOG_LINES = 200;

// ── Connect to server ────────────────────────────────────────────────────────
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = io(location.origin, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  socket.on('connect', () => {
    addLog('info', '✓ Connected to bot server');
    console.log('Socket connected:', socket.id);
  });

  socket.on('disconnect', () => {
    addLog('err', 'Disconnected from server');
    setRunning(false);
  });

  socket.on('connect_error', (err) => {
    addLog('err', `Connection error: ${err.message}`);
    console.error('Connection error:', err);
  });

  socket.on('init', (data) => {
    addLog('info', 'State received from bot');
    if (data.config) applyConfig(data.config);
    if (data.prices) { state.prices = data.prices; renderTokenList(); }
    if (data.mints) { state.mints = data.mints; }
    if (data.trades) { state.trades = data.trades; renderTradeLog(); }
    if (data.positions) { state.positions = data.positions; renderPositions(); }
    if (data.movers) { state.movers = data.movers; renderMovers(); }
    if (data.wallet) updateWalletDisplay(data.wallet);
    setRunning(data.running);
  });

  socket.on('tick', (data) => {
    if (data.prices) state.prices = { ...state.prices, ...data.prices };
    if (data.signals) state.signals = { ...state.signals, ...data.signals };
    if (data.trades) state.trades = data.trades;
    if (data.positions) state.positions = data.positions;
    if (data.movers) state.movers = data.movers;

    renderTokenList();
    renderTradeLog();
    renderPositions();
    renderMovers();
    updateStatsBar(data);
    updateTickerTape();

    if (state.selectedToken && data.signals && data.signals[state.selectedToken]) {
      renderTokenDetail(state.selectedToken, data.signals[state.selectedToken]);
    }

    const elapsed = data.elapsed ? `${data.elapsed}ms` : '--';
    document.getElementById('sbLastTick').textContent = new Date().toLocaleTimeString();
    addLog('info', `Tick: ${Object.keys(data.prices||{}).length} tokens in ${elapsed}`);
  });

  socket.on('trade', (trade) => {
    state.trades.push(trade);
    if (state.trades.length > 200) state.trades.shift();
    renderTradeLog();
    const dir = trade.direction;
    const pnl = trade.result?.pnl ? ` PnL: $${trade.result.pnl}` : '';
    addLog(dir === 'BUY' ? 'buy' : 'sell',
      `${dir} ${trade.symbol} @ $${formatPrice(trade.price)} [${trade.mode}]${pnl}`);
  });

  socket.on('status', (data) => {
    setRunning(data.running);
    if (data.mode) updateModeBadge(data.mode);
  });

  socket.on('config_update', (cfg) => {
    addLog('info', `Config updated: mode=${cfg.mode} strategy=${cfg.strategy}`);
    applyConfig(cfg);
  });

  socket.on('bot_error', (err) => {
    addLog('err', `Bot error: ${err.message}`);
  });
}

// ── Bot controls ─────────────────────────────────────────────────────────
function startBot() {
  if (!socket || !socket.connected) {
    addLog('err', 'Socket not connected!');
    return;
  }
  socket.emit('start_bot');
  document.getElementById('btnStart').disabled = true;
  addLog('info', 'Start command sent...');
}

function stopBot() {
  if (!socket || !socket.connected) {
    addLog('err', 'Socket not connected!');
    return;
  }
  socket.emit('stop_bot');
  addLog('warn', 'Stop command sent');
}

function manualTick() {
  if (!socket || !socket.connected) {
    addLog('err', 'Socket not connected!');
    return;
  }
  socket.emit('manual_tick');
  addLog('info', 'Manual tick triggered');
}

function setMode(mode) {
  if (mode === 'LIVE') {
    if (!confirm('⚠ WARNING: LIVE mode will execute REAL on-chain trades using REAL funds. Continue?')) {
      document.getElementById('modeSelect').value = 'PAPER';
      return;
    }
  }
  if (socket && socket.connected) {
    socket.emit('update_config', { mode });
  }
  updateModeBadge(mode);
}

function setStrategy(strategy) {
  if (socket && socket.connected) {
    socket.emit('update_config', { strategy });
  }
  addLog('info', `Strategy set to: ${strategy}`);
}

function setTradeAmt(val) {
  if (socket && socket.connected) {
    socket.emit('update_config', { tradeAmountUSD: parseFloat(val) });
  }
}

function setConfig() {
  if (socket && socket.connected) {
    socket.emit('update_config', {
      stopLossPct: parseFloat(document.getElementById('slPct').value),
      takeProfitPct: parseFloat(document.getElementById('tpPct').value),
      pollIntervalSec: parseInt(document.getElementById('pollInt').value),
    });
  }
}

// ── Rendering ──────────────────────────────────────────────────────────
function formatPrice(p) {
  if (p === null || p === undefined || isNaN(p)) return '---';
  if (p === 0) return '0.00';
  if (p >= 1) return p.toFixed(4);
  
  let s = p.toFixed(10);
  s = s.replace(/0+$/, ''); // remove trailing zeroes
  if (s.endsWith('.')) s = s.slice(0, -1);
  return s;
}

function renderTokenList() {
  const container = document.getElementById('tokenList');
  const prices = state.prices;
  const symbols = Object.keys(prices);

  if (!symbols.length) {
    container.innerHTML = '<div class="empty">Waiting for price data...</div>';
    return;
  }

  // Sort by absolute 24h change
  const sorted = symbols.slice().sort((a, b) => {
    return Math.abs((prices[b].change24h||0)) - Math.abs((prices[a].change24h||0));
  });

  const rows = sorted.map(sym => {
    const p = prices[sym];
    const sig = state.signals[sym];
    const chgClass = (p.change24h||0) > 0 ? 'pos' : (p.change24h||0) < 0 ? 'neg' : 'neu';
    const chgStr = p.change24h !== null ? `${p.change24h >= 0 ? '+' : ''}${(p.change24h||0).toFixed(2)}%` : '--';
    const sigStr = sig ? sig.signal : 'NONE';
    const isSelected = state.selectedToken === sym;

    return `<div class="token-row${isSelected?' selected':''}" onclick="selectToken('${sym}')">
      <span class="token-symbol">${sym}</span>
      <span class="token-price">$${formatPrice(p.price)}</span>
      <span class="token-change ${chgClass}">${chgStr}</span>
      <span class="token-signal ${sigStr}">${sigStr}</span>
    </div>`;
  }).join('');

  container.innerHTML = rows;
  document.getElementById('tokenCount').textContent = `${symbols.length} / 30`;
}

function selectToken(sym) {
  state.selectedToken = sym;
  renderTokenList(); // re-render to show selection
  const sig = state.signals[sym];
  const price = state.prices[sym];
  if (price) {
    renderTokenDetail(sym, sig);
  }
}

function renderTokenDetail(sym, sig) {
  document.getElementById('sdSymbol').textContent = sym;
  const price = state.prices[sym];
  document.getElementById('sdPrice').textContent = price ? `$${formatPrice(price.price)}` : '---';

  const addressEl = document.getElementById('sdAddress');
  const solscanEl = document.getElementById('sdSolscan');
  const geckoEl = document.getElementById('sdGecko');
  if (state.mints && state.mints[sym]) {
    addressEl.textContent = state.mints[sym];
    solscanEl.href = `https://solscan.io/token/${state.mints[sym]}`;
    solscanEl.style.display = 'block';
    if (geckoEl) {
      geckoEl.href = `https://www.geckoterminal.com/solana/tokens/${state.mints[sym]}`;
      geckoEl.style.display = 'block';
    }
  } else {
    addressEl.textContent = '---';
    solscanEl.style.display = 'none';
    if (geckoEl) geckoEl.style.display = 'none';
  }

  if (sig) {
    const sigEl = document.getElementById('sdSignal');
    sigEl.textContent = sig.signal;
    sigEl.className = 'stat-value ' + (sig.signal === 'BUY' ? 'green' : sig.signal === 'SELL' ? 'red' : 'yellow');

    // Show breakdown for ALL strategy
    if (sig.breakdown) {
      const bg = document.getElementById('breakdownGrid');
      bg.style.display = 'grid';
      renderBreakdownCard('bcMa', 'MA CROSS', sig.breakdown.MA_CROSS);
      renderBreakdownCard('bcRsi', 'RSI', sig.breakdown.RSI);
      renderBreakdownCard('bcPc', 'PRICE %', sig.breakdown.PRICE_CHANGE);
    } else {
      document.getElementById('breakdownGrid').style.display = 'none';
    }
  }
}

function renderBreakdownCard(id, title, data) {
  if (!data) return;
  const card = document.getElementById(id);
  if (!card) return;
  const sigColor = data.signal === 'BUY' ? 'var(--buy)' : data.signal === 'SELL' ? 'var(--sell)' : 'var(--hold)';
  card.innerHTML = `
    <div class="bc-title">${title}</div>
    <div class="bc-signal" style="color:${sigColor}">${data.signal}</div>
    <div class="bc-reason">${data.reason || '--'}</div>
    <div class="bc-conf"><div class="bc-conf-fill" style="width:${data.confidence||0}%;background:${sigColor}"></div></div>
  `;
}

function renderTradeLog() {
  const container = document.getElementById('tradeLog');
  const trades = [...state.trades].reverse();

  if (!trades.length) {
    container.innerHTML = '<div class="empty">No trades yet</div>';
    document.getElementById('tradeCount').textContent = '0 trades';
    return;
  }

  document.getElementById('tradeCount').textContent = `${trades.length} trades`;

  const rows = trades.slice(0, 100).map(t => {
    const ts = new Date(t.timestamp).toLocaleTimeString();
    const pnl = t.result?.pnl ? ` (${t.result.pnl >= 0 ? '+' : ''}$${t.result.pnl})` : '';
    return `<div class="trade-row">
      <span style="color:var(--text3);font-size:9px">${ts}</span>
      <span class="trade-dir ${t.direction}">${t.direction}</span>
      <span class="trade-sym">${t.symbol}</span>
      <span class="trade-amt">$${(t.amountUSD||0).toFixed(2)}</span>
      <span class="trade-price">$${formatPrice(t.price)}</span>
      <span class="trade-reason">${t.reason || '--'}${pnl}</span>
    </div>`;
  }).join('');

  container.innerHTML = rows;
}

function renderPositions() {
  const container = document.getElementById('positions');
  const pos = state.positions;
  const keys = Object.keys(pos);

  if (!keys.length) {
    container.innerHTML = '<div class="empty" style="padding:10px">No open positions</div>';
    return;
  }

  const html = keys.map(sym => {
    const p = pos[sym];
    const currentPrice = state.prices[sym]?.price;
    let pnlPct = 0;
    let pnlUSD = 0;
    if (currentPrice && p.entryPrice) {
      pnlPct = ((currentPrice - p.entryPrice) / p.entryPrice) * 100;
      pnlUSD = (p.tokensHeld || 0) * currentPrice - p.amountUSD;
    }
    const pnlColor = pnlPct >= 0 ? 'var(--buy)' : 'var(--sell)';
    const barW = Math.min(Math.abs(pnlPct) * 5, 100);

    return `<div class="position-row">
      <div class="position-sym">${sym} <span style="color:var(--text3);font-size:9px;font-family:'Share Tech Mono'">OPEN</span></div>
      <div class="position-stats">
        <div class="position-stat"><div class="ps-l">ENTRY</div><div class="ps-v">$${formatPrice(p.entryPrice)}</div></div>
        <div class="position-stat"><div class="ps-l">CURRENT</div><div class="ps-v">$${currentPrice ? formatPrice(currentPrice) : '--'}</div></div>
        <div class="position-stat"><div class="ps-l">SIZE</div><div class="ps-v">$${(p.amountUSD||0).toFixed(2)}</div></div>
        <div class="position-stat"><div class="ps-l">P&L</div><div class="ps-v" style="color:${pnlColor}">${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% ($${pnlUSD.toFixed(2)})</div></div>
      </div>
      <div class="pnl-bar"><div class="pnl-bar-fill" style="width:${barW}%;background:${pnlColor}"></div></div>
    </div>`;
  }).join('');

  container.innerHTML = html;
}

function renderMovers() {
  const container = document.getElementById('moversPanel');
  const { gainers, losers } = state.movers;

  if (!gainers.length && !losers.length) {
    container.innerHTML = '<div class="empty" style="padding:8px">No data</div>';
    return;
  }

  const gainHtml = gainers.slice(0, 3).map(t =>
    `<div class="mover-row">
      <span class="mover-sym">${t.symbol}</span>
      <span class="mover-chg pos">+${(t.change24h||0).toFixed(2)}%</span>
    </div>`
  ).join('');

  const loseHtml = losers.slice(0, 3).map(t =>
    `<div class="mover-row">
      <span class="mover-sym">${t.symbol}</span>
      <span class="mover-chg neg">${(t.change24h||0).toFixed(2)}%</span>
    </div>`
  ).join('');

  container.innerHTML = `
    <div style="font-size:9px;color:var(--buy);letter-spacing:1px;margin-bottom:4px">▲ GAINERS</div>
    ${gainHtml}
    <div style="font-size:9px;color:var(--sell);letter-spacing:1px;margin:6px 0 4px">▼ LOSERS</div>
    ${loseHtml}
  `;
}

function updateStatsBar(data) {
  const sigs = data.signals || {};
  let buys = 0, sells = 0;
  Object.values(sigs).forEach(s => {
    if (s.signal === 'BUY') buys++;
    if (s.signal === 'SELL') sells++;
  });

  document.getElementById('sbTokens').textContent = Object.keys(state.prices).length.toString();
  document.getElementById('sbBuy').textContent = buys.toString();
  document.getElementById('sbSell').textContent = sells.toString();
  document.getElementById('sbTrades').textContent = state.trades.length.toString();

  // Calculate total paper PnL
  let totalPnl = 0;
  state.trades.forEach(t => {
    if (t.result?.pnl) totalPnl += parseFloat(t.result.pnl);
  });
  const pnlEl = document.getElementById('sbPnl');
  pnlEl.textContent = `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`;
  pnlEl.className = 'sb-value ' + (totalPnl >= 0 ? 'green' : 'red');
}

function updateTickerTape() {
  const prices = state.prices;
  const syms = Object.keys(prices);
  if (!syms.length) return;

  const items = syms.map(sym => {
    const p = prices[sym];
    const chg = (p.change24h||0).toFixed(2);
    const color = p.change24h > 0 ? '#00ff88' : p.change24h < 0 ? '#ff3366' : '#7ab3cc';
    return `<span class="ticker-item"><span class="t-sym">${sym}</span><span style="color:${color}">$${formatPrice(p.price)} (${chg > 0 ? '+' : ''}${chg}%)</span></span>`;
  }).join('');

  document.getElementById('tickerInner').innerHTML = items;
}

function updateWalletDisplay(wallet) {
  const el = document.getElementById('sbWallet');
  if (wallet.error) {
    el.textContent = 'No wallet';
    return;
  }
  el.textContent = `${(wallet.solBalance||0).toFixed(4)} SOL`;
}

// ── Log ────────────────────────────────────────────────────────────
function addLog(type, msg) {
  const ts = new Date().toLocaleTimeString();
  const classMap = { buy: 'log-buy', sell: 'log-sell', info: 'log-info', warn: 'log-warn', err: 'log-err' };
  const cls = classMap[type] || 'log-info';
  eventLogLines.unshift(`<div class="log-line"><span class="log-ts">${ts}</span><span class="${cls}">${msg}</span></div>`);
  if (eventLogLines.length > MAX_LOG_LINES) eventLogLines.pop();
  document.getElementById('eventLog').innerHTML = eventLogLines.join('');
  document.getElementById('logCount').textContent = eventLogLines.length.toString();
}

// ── UI helpers ──────────────────────────────────────────────────────────
function setRunning(running) {
  state.running = running;
  document.getElementById('statusDot').className = 'status-dot' + (running ? ' running' : '');
  document.getElementById('statusText').textContent = running ? 'RUNNING' : 'OFFLINE';
  document.getElementById('btnStart').disabled = running;
  document.getElementById('btnStop').disabled = !running;
}

function updateModeBadge(mode) {
  const badge = document.getElementById('modeBadge');
  badge.textContent = mode;
  badge.className = 'mode-badge ' + (mode === 'LIVE' ? 'live' : 'paper');
}

function applyConfig(cfg) {
  if (cfg.mode) {
    document.getElementById('modeSelect').value = cfg.mode;
    updateModeBadge(cfg.mode);
  }
  if (cfg.strategy) document.getElementById('stratSelect').value = cfg.strategy;
  if (cfg.tradeAmountUSD) document.getElementById('tradeAmt').value = cfg.tradeAmountUSD;
  if (cfg.stopLossPct) document.getElementById('slPct').value = cfg.stopLossPct;
  if (cfg.takeProfitPct) document.getElementById('tpPct').value = cfg.takeProfitPct;
  if (cfg.pollIntervalSec) document.getElementById('pollInt').value = cfg.pollIntervalSec;
}

// ── Clock ───────────────────────────────────────────────────────────
function updateClock() {
  document.getElementById('clockEl').textContent = new Date().toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

// ── Init ────────────────────────────────────────────────────────────
connect();
addLog('info', 'Dashboard initialized - connecting to bot...');
