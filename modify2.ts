import fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf-8');

const importWeb3 = `import { Connection, PublicKey, Keypair } from "@solana/web3.js";\nimport bs58 from "bs58";\n`;

code = importWeb3 + code;

const walletLogic = `
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
`;

code = code.replace(/async function startServer\(\) \{/, walletLogic + "\nasync function startServer() {\n  fetchWalletBalance();\n  setInterval(fetchWalletBalance, 60000);\n");

fs.writeFileSync('server.ts', code);
console.log('Updated server.ts with wallet balance logic');
