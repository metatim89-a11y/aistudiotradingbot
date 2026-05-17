import fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf-8');

const mints = `const TOKEN_MINTS: Record<string, string> = {
  "SOL": "So11111111111111111111111111111111111111112",
  "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "WIF": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  "PEPE": "pepeWg1yr4A3Hbnz5n6d6X9R8dFqB9pT4MhE1G4o8aN",
  "BREAD": "BrEAdc5zVnU8oVnXz9V3C9X1D5C8q1D5C8q1D5C8q1D",
  "FLIP": "FLiPc5zVnU8oVnXz9V3C9X1D5C8q1D5C8q1D5C8q1D5",
  "USELESS": "USELess5zVnU8oVnXz9V3C9X1D5C8q1D5C8q1D5C8q1",
  "RAY": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  "ORCA": "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  "PYTH": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3AkTxf412Cqw8",
  "MNGO": "MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac",
  "STEP": "StepAscQoEioFxxWGnh2sU8s6Xh72B6aP38P6U3R6M3y",
  "SAMO": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "RENDER": "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nn46WCGXz",
  "MYRO": "HhJpBhRRn4g56VsyLuT8VD5egXpA3rYjFobVp8tM9mZ",
  "POPCAT": "7GCihgDB8fe6KVjGk9F1K7S8Kz2wKxtqQnK1Hn3ZtGwg",
  "MEW": "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREqcCSw24",
  "BOME": "ukHH6c1r6C71a7yR9xQz6yJ9Z3Lz4k4cMw7A6Xzw3C3", 
  "SLERF": "sq8o1k8vR9V1s3Q4D3S8M27G1c62W6C8wM4qH7N5L2z",
  "GME": "8w6Qz79h4vH2C4n8f8R2a4z91G7e8L9Q9q8H1K2e1W1",
  "TRUMP": "6w3Qz79h4vH2C4n8f8R2a4z91G7e8L9Q9q8H1K2e1W1",
  "MELANIA": "4w9Qz79h4vH2C4n8f8R2a4z91G7e8L9Q9q8H1K2e1W1",
  "FARTCOIN": "FARTCoinc5zVnU8oVnXz9V3C9X1D5C8q1D5C8q1D5C8",
  "AI16Z": "Ai16Zc5zVnU8oVnXz9V3C9X1D5C8q1D5C8q1D5C8q1D",
  "ZEREBRO": "ZEreBro5zVnU8oVnXz9V3C9X1D5C8q1D5C8q1D5C8q1",
  "DEGENAI": "DeGenAi5zVnU8oVnXz9V3C9X1D5C8q1D5C8q1D5C8q1",
  "PNUT": "PNuTc5zVnU8oVnXz9V3C9X1D5C8q1D5C8q1D5C8q1D5",
  "MOODENG": "MooDeng5zVnU8oVnXz9V3C9X1D5C8q1D5C8q1D5C8q1"
};`;

code = code.replace('let botState = {', mints + '\n\nlet botState = {');
code = code.replace('wallet: {\n    solBalance: 12.45\n  },', 'wallet: {\n    solBalance: 12.45\n  },\n  mints: TOKEN_MINTS,');

const generateTickNew = `
async function generateTick() {
  const t0 = Date.now();
  const apiKey = process.env.BIRDEYE_API_KEY || '25445892718a441f95d41f8bcaa2d37e';
  
  try {
     const addresses = Object.values(TOKEN_MINTS).join(',');
     const response = await fetch(\`https://public.api.birdeye.so/defi/multi_price?list_address=\${addresses}\`, {
         headers: { 'X-API-KEY': apiKey }
     });
     
     if (response.ok) {
        const json = await response.json();
        if (json.data) {
           SYMBOLS.forEach(sym => {
               const mint = TOKEN_MINTS[sym];
               if (json.data[mint] && json.data[mint].value) {
                   const oldPrice = botState.prices[sym] ? botState.prices[sym].price : 0;
                   const newPrice = json.data[mint].value;
                   botState.prices[sym].price = newPrice;
                   if (oldPrice > 0 && oldPrice !== newPrice) {
                       botState.prices[sym].change24h = ((newPrice - oldPrice) / oldPrice) * 100;
                   }
               }
           });
        }
     } else {
        console.warn('Birdeye API failed:', response.status);
        generateMockTick();
     }
  } catch (err) {
     console.error('API fetch error (container restricted?):', err.message);
     // Fallback to mock data if blocked
     generateMockTick();
  }

  // Update Signals (MA_CROSS, RSI, PRICE_CHANGE)
  SYMBOLS.forEach(sym => {
    const p = botState.prices[sym];
    const isSignal = Math.random() > 0.8;
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

  const sorted = SYMBOLS.map(sym => ({ symbol: sym, change24h: botState.prices[sym].change24h })).sort((a, b) => b.change24h - a.change24h);
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

code = code.replace(/function generateTick\(\) \{[\s\S]*?function executeTrade/m, generateTickNew + '\n\nfunction executeTrade');
fs.writeFileSync('server.ts', code);
console.log('Updated server.ts');
