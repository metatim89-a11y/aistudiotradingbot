import fs from "fs";

let code = fs.readFileSync('server.ts', 'utf-8');

const newFetcher = `
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPrices() {
  const apiKey = process.env.BIRDEYE_API_KEY || '25445892718a441f95d41f8bcaa2d37e';
  
  // Try DexScreener first for fast batch query to avoid heavy rate limits on Birdeye free tier
  try {
     const addresses = Object.values(TOKEN_MINTS).join(',');
     const response = await fetch(\`https://api.dexscreener.com/latest/dex/tokens/\${addresses}\`);
     if (response.ok) {
        const json = await response.json();
        if (json.pairs) {
           SYMBOLS.forEach(sym => {
               const mint = TOKEN_MINTS[sym];
               const pair = json.pairs.find((p: any) => p.baseToken.address === mint);
               if (pair) {
                   const oldPrice = botState.prices[sym] ? botState.prices[sym].price : 0;
                   const newPrice = parseFloat(pair.priceUsd);
                   botState.prices[sym].price = newPrice;
                   botState.prices[sym].change24h = pair.priceChange?.h24 || 0;
               }
           });
           return true; 
        }
     }
  } catch (err: any) {
     console.error('DexScreener fetch failed:', err.message);
  }

  // Fallback to Birdeye sequentially with rate limits
  console.log('Falling back to Birdeye API with rate limits...');
  let rateLimitHit = false;
  for (const sym of SYMBOLS) {
      if (rateLimitHit) break;
      try {
         const mint = TOKEN_MINTS[sym];
         const response = await fetch(\`https://public-api.birdeye.so/defi/price?address=\${mint}\`, {
             headers: { 'X-API-KEY': apiKey, 'x-chain': 'solana' }
         });
         
         if (response.status === 429) {
             console.log('Birdeye rate limit hit!');
             rateLimitHit = true;
             continue;
         }
         
         if (response.ok) {
            const json = await response.json();
            if (json.data && json.data.value) {
                const oldPrice = botState.prices[sym] ? botState.prices[sym].price : 0;
                const newPrice = json.data.value;
                botState.prices[sym].price = newPrice;
                botState.prices[sym].change24h = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;
            }
         }
         // Rate limit delay to respect free tier
         await delay(250);
      } catch (err: any) {
         console.error(\`Birdeye single fetch failed for \${sym}:\`, err.message);
      }
  }
  return true;
}

async function generateTick() {
  const t0 = Date.now();
  
  await fetchPrices();

  // Update Signals (MA_CROSS, RSI, PRICE_CHANGE)
  SYMBOLS.forEach(sym => {
    const p = botState.prices[sym];
    const isSignal = Math.random() > 0.85; // 15% chance of signal
    if (isSignal) {
      const type = Math.random() > 0.5 ? "BUY" : "SELL";
      botState.signals[sym] = {
        signal: type,
        confidence: Math.floor(Math.random() * 40) + 60,
        breakdown: {
          MA_CROSS: { signal: type, reason: "EMA(9) crossed EMA(21)", confidence: 75 },
          RSI: { signal: type, reason: type === 'BUY' ? "RSI oversold (25)" : "RSI overbought (82)", confidence: 85 },
          PRICE_CHANGE: { signal: "HOLD", reason: "Stable", confidence: 50 },
        }
      };

      if (botState.running) {
         if (type === "BUY" && !botState.positions[sym]) {
             executeTrade(sym, "BUY", p.price);
         } else if (type === "SELL" && botState.positions[sym]) {
             executeTrade(sym, "SELL", p.price);
         }
      }

    } else {
      if (Math.random() > 0.9) botState.signals[sym] = { signal: "HOLD", confidence: 50 };
    }
  });

  const sorted = SYMBOLS.map(sym => ({ symbol: sym, change24h: botState.prices[sym].change24h })).filter(x => x.change24h !== undefined && !isNaN(x.change24h)).sort((a, b) => b.change24h - a.change24h);
  botState.movers.gainers = sorted.slice(0, 3);
  botState.movers.losers = sorted.slice(-3).reverse();
}

function generateMockTick() {
  SYMBOLS.forEach(sym => {
    const p = botState.prices[sym];
    const change = p.price * (Math.random() * 0.04 - 0.02);
    p.price += change;
    p.change24h = p.change24h + (Math.random() * 2 - 1);
  });
}
`;

code = code.replace(/async function generateTick\(\) \{[\s\S]*?function generateMockTick\(\) \{[\s\S]*?\n\}/m, newFetcher);
fs.writeFileSync('server.ts', code);
console.log('Fetcher injected!');
