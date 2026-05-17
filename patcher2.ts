import fs from "fs";

let code = fs.readFileSync('server.ts', 'utf-8');

const newFetcherFn = `
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPrices() {
  const apiKey = process.env.BIRDEYE_API_KEY || '25445892718a441f95d41f8bcaa2d37e';
  
  // Try Birdeye sequentially with rate limits first as requested
  let rateLimitHit = false;
  let successCount = 0;
  for (const sym of SYMBOLS) {
      if (rateLimitHit) break;
      try {
         const mint = TOKEN_MINTS[sym];
         const response = await fetch(\`https://public-api.birdeye.so/defi/price?address=\${mint}\`, {
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
                successCount++;
            }
         }
         // Rate limit delay to respect free tier
         await delay(150); // 150ms delay between requests
      } catch (err: any) {
         console.error(\`Birdeye single fetch failed for \${sym}:\`, err.message);
      }
  }

  // Fallback to DexScreener if Birdeye failed or hit rate limits for missing tokens
  if (rateLimitHit || successCount < SYMBOLS.length) {
      console.log('Falling back to DexScreener API for missing tokens...');
      try {
         const addresses = Object.values(TOKEN_MINTS).join(',');
         const response = await fetch(\`https://api.dexscreener.com/latest/dex/tokens/\${addresses}\`);
         if (response.ok) {
            const json = await response.json();
            if (json.pairs) {
               SYMBOLS.forEach(sym => {
                   const mint = TOKEN_MINTS[sym];
                   const pair = json.pairs.find((p: any) => p.baseToken.address === mint);
                   // only update if not already updated by Birdeye this tick
                   if (pair && (!botState.prices[sym] || successCount === 0 || rateLimitHit)) {
                       botState.prices[sym].price = parseFloat(pair.priceUsd);
                       botState.prices[sym].change24h = pair.priceChange?.h24 || 0;
                   }
               });
            }
         }
      } catch (err: any) {
         console.error('DexScreener fetch failed:', err.message);
      }
  }
  
  return true;
}
`;

code = code.replace(/const delay = [\s\S]*?async function fetchPrices\(\) \{[\s\S]*?return true;\n\}/m, newFetcherFn.trim());

fs.writeFileSync('server.ts', code);
console.log('fetchPrices rewritten to prioritize Birdeye');
