import "dotenv/config";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as bs58 from "bs58";
import express from "express";
import path from "path";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { createServer as createViteServer } from "vite";

const PORT = process.env.PORT || 3000;

// Bot State
const TOKEN_MINTS: Record<string, string> = {
  "SOL": "So11111111111111111111111111111111111111112",
  "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "WIF": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  "PEPE": "B5WTLaRwaUQpKk7ir1wniNB6m5o8GgMrimhKMYan2R6B",
  "BREAD": "29EFDZckLx6SF1QZKVxFZxXU55a2bxXCVHNmZr4wpump",
  "FLIP": "GdbJgfLXG5pBEibnrpSvfmXfbNKvyZkLQoTiQLoJpump",
  "USELESS": "Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk",
  "RAY": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  "ORCA": "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  "PYTH": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  "MNGO": "MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac",
  "STEP": "StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT",
  "SAMO": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "RENDER": "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
  "MYRO": "HhJpBhRRn4g56VsyLuT8DL5Bv31HkXqsrahTTUCZeZg4",
  "POPCAT": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  "MEW": "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
  "BOME": "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82", 
  "SLERF": "7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3",
  "GME": "8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB",
  "TRUMP": "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
  "MELANIA": "FUAfBo2jgks6gB4Z4LfZkqSZgzNucisEHqnNebaRxM1P",
  "FARTCOIN": "HnXDnwTa68tRhLRZdJkVRLAeYrUkCYgFgDavtwD1pump",
  "AI16Z": "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC",
  "ZEREBRO": "8x5VqbHA8D7NkD52uNuS5nnt3PwA8pLD34ymskeSo2Wn",
  "DEGENAI": "Gu3LDkn7Vx3bmCzLafYNKcDxv2mH7YN44NJZFXnypump",
  "PNUT": "2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump",
  "MOODENG": "ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY"
};

let botState = {
  running: false,
  config: {
    mode: "PAPER",
    strategy: "ALL",
    tradeAmountUSD: 25,
    stopLossPct: 5,
    takeProfitPct: 10,
    pollIntervalSec: 30,
  },
  prices: {} as Record<string, any>,
  signals: {} as Record<string, any>,
  trades: [] as any[],
  positions: {} as Record<string, any>,
  movers: { gainers: [], losers: [] } as { gainers: any[], losers: any[] },
  wallet: {
    solBalance: 12.45
  },
  mints: TOKEN_MINTS,
};

const SYMBOLS = [
  "SOL", "USDC", "JUP", "WIF", "BONK", "PEPE", "BREAD", "FLIP", "USELESS", "RAY",
  "ORCA", "PYTH", "MNGO", "STEP", "SAMO", "RENDER", "MYRO", "POPCAT", "MEW", "BOME",
  "SLERF", "GME", "TRUMP", "MELANIA", "FARTCOIN", "AI16Z", "ZEREBRO", "DEGENAI", "PNUT", "MOODENG"
];

// Initialize empty prices
SYMBOLS.forEach(sym => {
  botState.prices[sym] = {
    price: 0,
    change24h: 0
  };
});



const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPrices() {
  const apiKey = process.env.BIRDEYE_API_KEY || '25445892718a441f95d41f8bcaa2d37e';
  
  let successCount = 0;
  const updatedMints = new Set<string>();

  // Try DexScreener FIRST for fast bulk query (max 30 addresses)
  try {
     const addresses = Object.values(TOKEN_MINTS);
     // Chunk into arrays of 30 just in case
     const chunks: string[] = [];
     for (let i = 0; i < addresses.length; i += 30) {
         chunks.push(addresses.slice(i, i + 30).join(','));
     }
     
     for (const chunk of chunks) {
         const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`);
         if (response.ok) {
            const json = await response.json();
            if (json.pairs) {
               SYMBOLS.forEach(sym => {
                   const mint = TOKEN_MINTS[sym];
                   const pair = json.pairs.find((p: any) => p.baseToken.address === mint && p.chainId === 'solana');
                   if (pair) {
                       botState.prices[sym].price = parseFloat(pair.priceUsd) || 0;
                       botState.prices[sym].change24h = pair.priceChange?.h24 || 0;
                       updatedMints.add(mint);
                       successCount++;
                   }
               });
            }
         }
     }
  } catch (err: any) {
     console.error('DexScreener fetch failed:', err.message);
  }

  // Fallback to Birdeye for missing tokens
  let rateLimitHit = false;
  for (const sym of SYMBOLS) {
      const mint = TOKEN_MINTS[sym];
      if (updatedMints.has(mint)) continue; // Already updated via DexScreener
      if (rateLimitHit) break;
      
      try {
         const response = await fetch(`https://public-api.birdeye.so/defi/price?address=${mint}`, {
             headers: { 'X-API-KEY': apiKey, 'x-chain': 'solana' }
         });
         
         if (response.status === 429 || response.status === 401) {
             console.log('Birdeye rate limit or auth error hitting! ' + response.status);
             rateLimitHit = true;
             continue;
         }
         
         if (response.ok) {
            const json = await response.json();
            if (json.data && json.data.value) {
                const oldPrice = botState.prices[sym] ? botState.prices[sym].price : 0;
                const newPrice = json.data.value;
                botState.prices[sym].price = newPrice;
                botState.prices[sym].change24h = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : (json.data.priceChange24h || 0);
            }
         }
         // Rate limit delay
         await delay(250); 
      } catch (err: any) {
         console.error('Birdeye single fetch failed for ' + sym + ': ' + err.message);
      }
  }
  
  return true;
}

async function generateTick() {
  const t0 = Date.now();
  
  await fetchPrices();

  // Generate Real Signals (Based on 24h Price Change)
  SYMBOLS.forEach(sym => {
    const p = botState.prices[sym];
    
    // Simple mock indicator based on live price change
    let type = "HOLD";
    let conf = 50;
    let reason = "Stable";
    
    if (p.change24h > 5) {
      type = "BUY";
      conf = Math.min(60 + p.change24h * 2, 99);
      reason = `Price up ${p.change24h.toFixed(1)}% (Momentum)`;
    } else if (p.change24h < -5) {
      type = "SELL";
      conf = Math.min(60 + Math.abs(p.change24h) * 2, 99);
      reason = `Price down ${Math.abs(p.change24h).toFixed(1)}% (Stop-loss/Trend)`;
    }
    
    botState.signals[sym] = {
      signal: type,
      confidence: Math.round(conf),
      breakdown: {
        MA_CROSS: { signal: "HOLD", reason: "EMA cross not yet supported on this interval", confidence: 50 },
        RSI: { signal: "HOLD", reason: "RSI calculation needs more candles", confidence: 50 },
        PRICE_CHANGE: { signal: type, reason: reason, confidence: Math.round(conf) },
      }
    };

    if (botState.running && botState.config.mode === 'PAPER') {
       if (type === "BUY" && !botState.positions[sym]) {
           executeTrade(sym, "BUY", p.price, reason);
       } else if (type === "SELL" && botState.positions[sym]) {
           executeTrade(sym, "SELL", p.price, reason);
       }
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



function executeTrade(sym: string, direction: string, price: number, manualReason?: string) {
    const trade = {
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        symbol: sym,
        direction: direction,
        amountUSD: botState.config.tradeAmountUSD,
        price: price,
        mode: botState.config.mode,
        reason: manualReason || botState.signals[sym]?.breakdown?.PRICE_CHANGE?.reason || "Condition met",
        result: direction === "SELL" ? { pnl: ((price - botState.positions[sym]?.entryPrice) * botState.positions[sym]?.tokensHeld).toFixed(2) } : null
    };

    botState.trades.unshift(trade);
    if (botState.trades.length > 200) botState.trades.pop();

    if (direction === "BUY") {
        botState.positions[sym] = {
            entryPrice: price,
            amountUSD: botState.config.tradeAmountUSD,
            tokensHeld: botState.config.tradeAmountUSD / price
        };
    } else {
        delete botState.positions[sym];
    }

    return trade;
}


async function fetchWalletBalance() {
   try {
       const rpcUrl = process.env.HELIUS_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=7b4253c1-e49c-4f0f-90bc-fde5c0de1315";
       const pkStr = process.env.WALLET_PRIVATE_KEY || "65ght4LfEXN6tJz98Wf7kRZXDQWiNbXLTMpSyUWDoeM9G8tku3zjyZNfWy6tzhbC2pTnSJH7nPSJBx2uayzC32XJ";
       if (pkStr && pkStr !== 'YOUR_PRIVATE_KEY') {
           const connection = new Connection(rpcUrl, "confirmed");
           const keypair = Keypair.fromSecretKey(bs58.decode(pkStr));
           const balance = await connection.getBalance(keypair.publicKey);
           botState.wallet.solBalance = balance / 1e9;
       }
   } catch (err) {
       console.error("RPC balance fetch error:", err.message);
   }
}

async function startServer() {
  fetchWalletBalance();
  setInterval(fetchWalletBalance, 60000);

  const app = express();
  app.use(express.json());
  
  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: "*" } });

  let tickInterval: any = null;

  io.on("connection", (socket) => {
    console.log("Client connected");
    
    socket.emit("init", botState);
    
    socket.on("start_bot", () => {
      botState.running = true;
      io.emit("status", { running: botState.running, mode: botState.config.mode });
      
      if (tickInterval) clearInterval(tickInterval);
      tickInterval = setInterval(async () => {
        if (!botState.running) return;
        await generateTick();
        io.emit("tick", {
            prices: botState.prices,
            signals: Object.fromEntries(Object.entries(botState.signals).filter(([_, s]: [any, any]) => s.signal !== "HOLD")),
            trades: botState.trades,
            positions: botState.positions,
            movers: botState.movers,
            elapsed: 150
        });
      }, botState.config.pollIntervalSec * 1000); // Wait user config seconds (default 3s in mock context, normally 30s)
    });

    socket.on("stop_bot", () => {
      botState.running = false;
      if (tickInterval) clearInterval(tickInterval);
      io.emit("status", { running: botState.running, mode: botState.config.mode });
    });

    socket.on("manual_tick", async () => {
      await generateTick();
      io.emit("tick", {
            prices: botState.prices,
            signals: botState.signals,
            trades: botState.trades,
            positions: botState.positions,
            movers: botState.movers,
            elapsed: 150
        });
    });

    socket.on("update_config", (cfg) => {
      botState.config = { ...botState.config, ...cfg };
      io.emit("config_update", botState.config);
      
      // Fast mode for preview if pollIntervalSec modified
      if (botState.running && cfg.pollIntervalSec !== undefined) {
         clearInterval(tickInterval);
         tickInterval = setInterval(async () => {
            if (!botState.running) return;
            await generateTick();
            io.emit("tick", {
                prices: botState.prices,
                signals: botState.signals,
                trades: botState.trades,
                positions: botState.positions,
                movers: botState.movers,
                elapsed: 150
            });
         }, botState.config.pollIntervalSec * 1000);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  // Serve Vite in dev or static files in prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Bot Server running on port ${PORT}`);
  });
}

startServer();
