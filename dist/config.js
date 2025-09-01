"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = loadEnv;
const zod_1 = require("zod");
const EnvSchema = zod_1.z.object({
    RPC_URL: zod_1.z.string().min(1, 'RPC_URL is required'),
    PRIVATE_KEY: zod_1.z.string().optional().or(zod_1.z.literal('')).transform(v => (v ? v : undefined)),
    COMET_ADDRESS: zod_1.z.string().optional().or(zod_1.z.literal('')).transform(v => (v ? v : undefined)),
    COMET_REWARDS_ADDRESS: zod_1.z.string().optional().or(zod_1.z.literal('')).transform(v => (v ? v : undefined)),
});
function loadEnv() {
    const parsed = EnvSchema.safeParse({
        RPC_URL: process.env.RPC_URL,
        PRIVATE_KEY: process.env.PRIVATE_KEY,
        COMET_ADDRESS: process.env.COMET_ADDRESS,
        COMET_REWARDS_ADDRESS: process.env.COMET_REWARDS_ADDRESS,
    });
    if (!parsed.success) {
        const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new Error(`Invalid environment: ${issues}`);
    }
    return parsed.data;
}
