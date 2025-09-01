import dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import { Contract, JsonRpcProvider, formatUnits } from 'ethers';
import CometAbi from './abi/Comet.json';
import { loadEnv } from './config';

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

async function checkOnce(comet: Contract, accounts: string[]): Promise<void> {
  const [decimals, numAssets] = await Promise.all([
    comet.decimals().catch(() => 18),
    comet.numAssets().catch(() => 0)
  ]);

  for (const account of accounts) {
    const borrow = (await comet.borrowBalanceOf(account).catch(() => 0n)) as bigint;
    let healthy = true;
    try { healthy = await comet.isBorrowCollateralized(account); } catch {}

    const hasDebt = borrow > 0n;
    const status = healthy ? 'HEALTHY' : 'AT-RISK';
    console.log(`[${status}] ${account} debt=${formatUnits(borrow, decimals)}`);

    if (!healthy && hasDebt) {
      console.log(`  ALERT: account may be liquidatable soon`);
    }

    if (numAssets > 0) {
      const nonZero: Array<{asset: string, bal: string}> = [];
      for (let i = 0; i < Number(numAssets); i++) {
        const info = await comet.getAssetInfo(i);
        const bal = (await comet.collateralBalanceOf(account, info.asset).catch(() => 0n)) as bigint;
        if (bal > 0n) nonZero.push({ asset: info.asset, bal: bal.toString() });
      }
      if (nonZero.length) console.log('  Collateral balances:', nonZero);
    }
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const program = new Command();
  program
    .requiredOption('-a, --accounts <addresses>', 'Comma-separated addresses to monitor')
    .option('-w, --watch', 'Watch continuously')
    .option('-i, --interval <sec>', 'Polling interval seconds', '10')
    .parse(process.argv);

  const { accounts, watch, interval } = program.opts<{ accounts: string; watch?: boolean; interval: string }>();
  const list = accounts.split(',').map((s) => s.trim()).filter(Boolean);

  if (!env.COMET_ADDRESS) throw new Error('COMET_ADDRESS not set');
  const provider = new JsonRpcProvider(env.RPC_URL);
  const comet = new Contract(env.COMET_ADDRESS, CometAbi as any, provider);

  await checkOnce(comet, list);
  if (watch) {
    const ms = Math.max(1, Number(interval)) * 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await sleep(ms);
      await checkOnce(comet, list);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); }); 