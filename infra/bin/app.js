#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// cdk/bin/app.ts
/**
 * AWS CDK App for Large Context Agent
 * Deploy entire infrastructure with: cdk deploy
 */
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const agent_stack_1 = require("../lib/agent-stack");
const app = new cdk.App();
// Get AWS account ID for resource naming
const accountId = process.env.CDK_DEFAULT_ACCOUNT || 'default';
// Configuration from environment
const config = {
    frontendDomain: process.env.FRONTEND_DOMAIN || 'http://localhost:3000',
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    resourcePrefix: process.env.RESOURCE_PREFIX || accountId,
};
// Debug: Log if Google credentials are configured
console.log('🔍 CDK Environment Check:');
console.log('   RESOURCE_PREFIX:', config.resourcePrefix);
console.log('   GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? `SET (${process.env.GOOGLE_CLIENT_ID.length} chars)` : 'NOT SET');
console.log('   GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? `SET (${process.env.GOOGLE_CLIENT_SECRET.length} chars)` : 'NOT SET');
console.log('   CDK_DEFAULT_ACCOUNT:', process.env.CDK_DEFAULT_ACCOUNT);
console.log('   CDK_DEFAULT_REGION:', process.env.CDK_DEFAULT_REGION);
if (config.googleClientId && config.googleClientSecret) {
    console.log('✅ Google OAuth credentials detected');
}
else {
    console.log('⚠️  Google OAuth credentials NOT found (will only support email/password)');
}
// Create stack
new agent_stack_1.AgentStack(app, 'AgentStack', {
    config,
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
    },
    description: 'Full-stack serverless AI agent with large context handling',
});
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlCQUFpQjtBQUNqQjs7O0dBR0c7QUFDSCx1Q0FBcUM7QUFDckMsaURBQW1DO0FBQ25DLG9EQUFnRDtBQUVoRCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQix5Q0FBeUM7QUFDekMsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsSUFBSSxTQUFTLENBQUM7QUFFL0QsaUNBQWlDO0FBQ2pDLE1BQU0sTUFBTSxHQUFHO0lBQ2IsY0FBYyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxJQUFJLHVCQUF1QjtJQUN0RSxjQUFjLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0I7SUFDNUMsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0I7SUFDcEQsY0FBYyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxJQUFJLFNBQVM7Q0FDekQsQ0FBQztBQUVGLGtEQUFrRDtBQUNsRCxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUM7QUFDekMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDMUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxRQUFRLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ3JJLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLE1BQU0sU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUNqSixPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUN4RSxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUV0RSxJQUFJLE1BQU0sQ0FBQyxjQUFjLElBQUksTUFBTSxDQUFDLGtCQUFrQixFQUFFLENBQUM7SUFDdkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO0FBQ3JELENBQUM7S0FBTSxDQUFDO0lBQ04sT0FBTyxDQUFDLEdBQUcsQ0FBQywyRUFBMkUsQ0FBQyxDQUFDO0FBQzNGLENBQUM7QUFFRCxlQUFlO0FBQ2YsSUFBSSx3QkFBVSxDQUFDLEdBQUcsRUFBRSxZQUFZLEVBQUU7SUFDaEMsTUFBTTtJQUNOLEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQjtRQUN4QyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXO0tBQ2hGO0lBQ0QsV0FBVyxFQUFFLDREQUE0RDtDQUMxRSxDQUFDLENBQUM7QUFFSCxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG4vLyBjZGsvYmluL2FwcC50c1xuLyoqXG4gKiBBV1MgQ0RLIEFwcCBmb3IgTGFyZ2UgQ29udGV4dCBBZ2VudFxuICogRGVwbG95IGVudGlyZSBpbmZyYXN0cnVjdHVyZSB3aXRoOiBjZGsgZGVwbG95XG4gKi9cbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBBZ2VudFN0YWNrIH0gZnJvbSAnLi4vbGliL2FnZW50LXN0YWNrJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gR2V0IEFXUyBhY2NvdW50IElEIGZvciByZXNvdXJjZSBuYW1pbmdcbmNvbnN0IGFjY291bnRJZCA9IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQgfHwgJ2RlZmF1bHQnO1xuXG4vLyBDb25maWd1cmF0aW9uIGZyb20gZW52aXJvbm1lbnRcbmNvbnN0IGNvbmZpZyA9IHtcbiAgZnJvbnRlbmREb21haW46IHByb2Nlc3MuZW52LkZST05URU5EX0RPTUFJTiB8fCAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcbiAgZ29vZ2xlQ2xpZW50SWQ6IHByb2Nlc3MuZW52LkdPT0dMRV9DTElFTlRfSUQsXG4gIGdvb2dsZUNsaWVudFNlY3JldDogcHJvY2Vzcy5lbnYuR09PR0xFX0NMSUVOVF9TRUNSRVQsXG4gIHJlc291cmNlUHJlZml4OiBwcm9jZXNzLmVudi5SRVNPVVJDRV9QUkVGSVggfHwgYWNjb3VudElkLFxufTtcblxuLy8gRGVidWc6IExvZyBpZiBHb29nbGUgY3JlZGVudGlhbHMgYXJlIGNvbmZpZ3VyZWRcbmNvbnNvbGUubG9nKCfwn5SNIENESyBFbnZpcm9ubWVudCBDaGVjazonKTtcbmNvbnNvbGUubG9nKCcgICBSRVNPVVJDRV9QUkVGSVg6JywgY29uZmlnLnJlc291cmNlUHJlZml4KTtcbmNvbnNvbGUubG9nKCcgICBHT09HTEVfQ0xJRU5UX0lEOicsIHByb2Nlc3MuZW52LkdPT0dMRV9DTElFTlRfSUQgPyBgU0VUICgke3Byb2Nlc3MuZW52LkdPT0dMRV9DTElFTlRfSUQubGVuZ3RofSBjaGFycylgIDogJ05PVCBTRVQnKTtcbmNvbnNvbGUubG9nKCcgICBHT09HTEVfQ0xJRU5UX1NFQ1JFVDonLCBwcm9jZXNzLmVudi5HT09HTEVfQ0xJRU5UX1NFQ1JFVCA/IGBTRVQgKCR7cHJvY2Vzcy5lbnYuR09PR0xFX0NMSUVOVF9TRUNSRVQubGVuZ3RofSBjaGFycylgIDogJ05PVCBTRVQnKTtcbmNvbnNvbGUubG9nKCcgICBDREtfREVGQVVMVF9BQ0NPVU5UOicsIHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQpO1xuY29uc29sZS5sb2coJyAgIENES19ERUZBVUxUX1JFR0lPTjonLCBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04pO1xuXG5pZiAoY29uZmlnLmdvb2dsZUNsaWVudElkICYmIGNvbmZpZy5nb29nbGVDbGllbnRTZWNyZXQpIHtcbiAgY29uc29sZS5sb2coJ+KchSBHb29nbGUgT0F1dGggY3JlZGVudGlhbHMgZGV0ZWN0ZWQnKTtcbn0gZWxzZSB7XG4gIGNvbnNvbGUubG9nKCfimqDvuI8gIEdvb2dsZSBPQXV0aCBjcmVkZW50aWFscyBOT1QgZm91bmQgKHdpbGwgb25seSBzdXBwb3J0IGVtYWlsL3Bhc3N3b3JkKScpO1xufVxuXG4vLyBDcmVhdGUgc3RhY2tcbm5ldyBBZ2VudFN0YWNrKGFwcCwgJ0FnZW50U3RhY2snLCB7XG4gIGNvbmZpZyxcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxuICB9LFxuICBkZXNjcmlwdGlvbjogJ0Z1bGwtc3RhY2sgc2VydmVybGVzcyBBSSBhZ2VudCB3aXRoIGxhcmdlIGNvbnRleHQgaGFuZGxpbmcnLFxufSk7XG5cbmFwcC5zeW50aCgpO1xuXG4iXX0=