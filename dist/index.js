"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const commander_1 = require("commander");
const ethers_1 = require("ethers");
const Comet_json_1 = __importDefault(require("./abi/Comet.json"));
const config_1 = require("./config");
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
async function checkOnce(comet, accounts) {
    const [decimals, numAssets] = await Promise.all([
        comet.decimals().catch(() => 18),
        comet.numAssets().catch(() => 0)
    ]);
    for (const account of accounts) {
        const borrow = (await comet.borrowBalanceOf(account).catch(() => 0n));
        let healthy = true;
        try {
            healthy = await comet.isBorrowCollateralized(account);
        }
        catch { }
        const hasDebt = borrow > 0n;
        const status = healthy ? 'HEALTHY' : 'AT-RISK';
        console.log(`[${status}] ${account} debt=${(0, ethers_1.formatUnits)(borrow, decimals)}`);
        if (!healthy && hasDebt) {
            console.log(`  ALERT: account may be liquidatable soon`);
        }
        if (numAssets > 0) {
            const nonZero = [];
            for (let i = 0; i < Number(numAssets); i++) {
                const info = await comet.getAssetInfo(i);
                const bal = (await comet.collateralBalanceOf(account, info.asset).catch(() => 0n));
                if (bal > 0n)
                    nonZero.push({ asset: info.asset, bal: bal.toString() });
            }
            if (nonZero.length)
                console.log('  Collateral balances:', nonZero);
        }
    }
}
async function main() {
    const env = (0, config_1.loadEnv)();
    const program = new commander_1.Command();
    program
        .requiredOption('-a, --accounts <addresses>', 'Comma-separated addresses to monitor')
        .option('-w, --watch', 'Watch continuously')
        .option('-i, --interval <sec>', 'Polling interval seconds', '10')
        .parse(process.argv);
    const { accounts, watch, interval } = program.opts();
    const list = accounts.split(',').map((s) => s.trim()).filter(Boolean);
    if (!env.COMET_ADDRESS)
        throw new Error('COMET_ADDRESS not set');
    const provider = new ethers_1.JsonRpcProvider(env.RPC_URL);
    const comet = new ethers_1.Contract(env.COMET_ADDRESS, Comet_json_1.default, provider);
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
