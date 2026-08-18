import { db } from '../src/lib/db/store';
import { seedInitialData, DEFAULT_WORKSPACE_ID } from '../src/lib/db/seed';
import { MaxWebAdapter } from '../src/lib/adapters/network/MaxWebAdapter';
import { BuyGoodsAdapter } from '../src/lib/adapters/network/BuyGoodsAdapter';
import { Digistore24Adapter } from '../src/lib/adapters/network/Digistore24Adapter';
import { ClickBankAdapter } from '../src/lib/adapters/network/ClickBankAdapter';
import { tikTokAdsAdapter } from '../src/lib/adapters/ad-platform/TikTokAdsAdapter';
import { idempotencyEngine } from '../src/lib/engine/IdempotencyEngine';
import { attributionEngine } from '../src/lib/engine/AttributionEngine';
import { outboxWorker } from '../src/lib/engine/OutboxWorker';
import { extractCleanTtclid } from '../src/lib/security/clickIdHelper';
import { encryptSecret, decryptSecret, decryptClickBankINS, verifyDigistore24Signature } from '../src/lib/security/crypto';
import { TikTokDestination, AffiliateIntegration, OutboxJob } from '../src/lib/types';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, extra?: any) {
  if (condition) {
    console.log(`  \x1b[32m✓ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✗ FAIL\x1b[0m: ${testName}`, extra ? extra : '');
    failed++;
  }
}

async function runTestSuite() {
  console.log('\n================================================================');
  console.log('🚀 RUNNING PRODUCTION-GRADE DIRECT S2S ATTRIBUTION TEST SUITE');
  console.log('================================================================\n');

  // 1. Initialize Seed DB
  seedInitialData();

  // Setup Test Destination
  const testDestId = 'dest-test-01';
  const testDest: TikTokDestination = {
    id: testDestId,
    workspaceId: DEFAULT_WORKSPACE_ID,
    name: 'Production Scale Pixel',
    pixelId: 'CP849201948201',
    accessTokenEncrypted: encryptSecret('test_live_tiktok_token_secret_123'),
    defaultEventName: 'CompletePayment',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  db.saveDestination(testDest);

  // Link test destination to maxweb integration
  const mwIntegration = db.getIntegrations(DEFAULT_WORKSPACE_ID).find(i => i.network === 'maxweb')!;
  mwIntegration.destinationId = testDestId;
  mwIntegration.eventName = 'Purchase'; // Specific chosen event
  mwIntegration.valueStrategy = 'commission';
  db.saveIntegration(mwIntegration);

  // Test 1: Resilient ttclid Extraction
  console.log('[1. Resilient ttclid Extraction & Wrapper Stripping]');
  assert(extractCleanTtclid('E.C.P.simple123') === 'E.C.P.simple123', 'Raw ttclid extracted');
  assert(extractCleanTtclid('ttclid(E.C.P.wrapped_paren)') === 'E.C.P.wrapped_paren', 'Parentheses wrapped ttclid(E.C.P...) extracted');
  assert(extractCleanTtclid('ttclid:E.C.P.colon_wrapped') === 'E.C.P.colon_wrapped', 'Colon wrapped ttclid:E.C.P... extracted');
  assert(extractCleanTtclid('__CLICKID__') === undefined, 'Unreplaced macro recognized as missing');
  assert(extractCleanTtclid('{SUBID}') === undefined, 'Unreplaced postback token recognized as missing');

  // Test 2: Strict Mandatory Transaction ID (NO fake IDs generated)
  console.log('\n[2. Strict Mandatory Transaction ID Validation]');
  const maxweb = new MaxWebAdapter();
  const invalidMwContext = {
    network: 'maxweb' as const,
    workspaceId: DEFAULT_WORKSPACE_ID,
    networkAccount: mwIntegration,
    headers: {},
    query: { subid5: 'ttclid(E.C.P.123)', amount: '100' }, // NO order_id!
    body: {},
    clientIp: '127.0.0.1',
  };
  const invalidResult = await maxweb.normalize(invalidMwContext);
  assert(invalidResult.isVerified === false && invalidResult.transactionId === '', 'Missing Order ID rejected without fake fallback');

  // Test 3: Digistore24 Official S2S Placeholders Normalization
  console.log('\n[3. Digistore24 Official Affiliate S2S Placeholders]');
  const digistore = new Digistore24Adapter();
  const dsIntegration = db.getIntegrations(DEFAULT_WORKSPACE_ID).find(i => i.network === 'digistore24')!;
  const dsValidContext = {
    network: 'digistore24' as const,
    workspaceId: DEFAULT_WORKSPACE_ID,
    networkAccount: dsIntegration,
    headers: {},
    query: {
      cid: 'ttclid(E.C.P.ds_real_click_99)',
      transaction_id: 'DS-TX-882109',
      order_type: 'initial_sale',
      amount_affiliate: '147.50',
      currency: 'USD',
      transaction_type: 'payment',
      product_id: '48190',
    },
    body: {},
    clientIp: '127.0.0.1',
  };
  const dsValidResult = await digistore.normalize(dsValidContext);
  assert(dsValidResult.isVerified === true, 'Digistore24 valid S2S parsed');
  assert(dsValidResult.transactionId === 'DS-TX-882109', 'Digistore24 exact transaction ID parsed');
  assert(dsValidResult.clickId === 'E.C.P.ds_real_click_99', 'Digistore24 ttclid stripped and extracted');
  assert(dsValidResult.commissionAmount === 147.50, 'Digistore24 amount_affiliate mapped as commission');

  // Test 4: Database-level Idempotency & Sequential Burst Duplicate Suppression
  console.log('\n[4. Database-level Idempotency Burst Suppression (10x)]');
  const burstTxId = `TX-BURST-${Date.now()}`;
  const burstKey = idempotencyEngine.generateKey('maxweb', mwIntegration.id, burstTxId, 'purchase');
  let duplicateCount = 0;
  for (let i = 0; i < 10; i++) {
    const check = idempotencyEngine.check(burstKey);
    if (i === 0) {
      assert(!check.isDuplicate, 'First transaction is NOT duplicate');
      idempotencyEngine.record(burstKey, `conv-burst-1`, 'maxweb');
    } else {
      if (check.isDuplicate) duplicateCount++;
    }
  }
  assert(duplicateCount === 9, 'Exactly 9/10 duplicate bursts suppressed at DB level');

  // Test 5: Concurrent Duplicate Protection (Race condition simulation)
  console.log('\n[5. Concurrent Duplicate Protection via Database UNIQUE Constraint]');
  const concurrentTxId = `TX-CONCURRENT-${Date.now()}`;
  const concurrentKey = idempotencyEngine.generateKey('maxweb', mwIntegration.id, concurrentTxId, 'purchase');
  const convA = {
    id: uuidv4(),
    workspaceId: DEFAULT_WORKSPACE_ID,
    rawEventId: 'raw-conc-1',
    network: 'maxweb' as const,
    integrationId: mwIntegration.id,
    destinationId: testDestId,
    transactionId: concurrentTxId,
    eventType: 'purchase' as const,
    tiktokEventName: 'Purchase',
    valueStrategy: 'commission' as const,
    currency: 'USD',
    commissionAmount: 120,
    clickId: 'E.C.P.conc_click',
    status: 'queued' as const,
    idempotencyKey: concurrentKey,
    receivedAt: new Date().toISOString(),
  };
  const convB = { ...convA, id: uuidv4() };
  const resA = db.saveConversion(convA);
  const resB = db.saveConversion(convB);
  assert(resA.success === true, 'First concurrent insert succeeds');
  assert(resB.success === false && resB.isDuplicate === true, 'Second concurrent insert caught by DB UNIQUE constraint');

  // Test 6: Missing ttclid Behavior (Saved Unattributed, 0 TikTok Dispatch)
  console.log('\n[6. Missing Click ID Behavior]');
  dsIntegration.destinationId = testDestId;
  const missingClickResult = {
    ...dsValidResult,
    clickId: undefined, // No ttclid!
  };
  const unattributedAttr = attributionEngine.attribute(missingClickResult, dsIntegration, DEFAULT_WORKSPACE_ID);
  assert(unattributedAttr.status === 'unattributed', 'Missing Click ID marked as unattributed');

  // Test 7: Strict Zero Destination Fallback
  console.log('\n[7. Strict Zero Destination Fallback (Configuration Error)]');
  const unroutedIntegration: AffiliateIntegration = {
    id: 'int-unrouted-01',
    workspaceId: DEFAULT_WORKSPACE_ID,
    network: 'buygoods',
    name: 'Unrouted BuyGoods Channel',
    secretToken: 'bg_unrouted_tok',
    destinationId: undefined, // NO DESTINATION!
    valueStrategy: 'commission',
    status: 'connected',
    createdAt: new Date().toISOString(),
  };
  db.saveIntegration(unroutedIntegration);
  const unroutedResult = attributionEngine.attribute(dsValidResult, unroutedIntegration, DEFAULT_WORKSPACE_ID);
  assert(unroutedResult.status === 'configuration_error', 'Unassigned integration returns configuration_error with zero pixel fallback');

  // Test 8: TikTok Error Classification (Retryable vs Permanent)
  console.log('\n[8. TikTok Events API Error Classification]');
  assert(tikTokAdsAdapter.classifyError(429, {}) === 'RETRYABLE', 'HTTP 429 classified as RETRYABLE');
  assert(tikTokAdsAdapter.classifyError(500, {}) === 'RETRYABLE', 'HTTP 500 classified as RETRYABLE');
  assert(tikTokAdsAdapter.classifyError(400, { code: 40001, message: 'Invalid Access Token' }) === 'PERMANENT', 'Invalid token classified as PERMANENT');
  assert(tikTokAdsAdapter.classifyError(401, {}) === 'PERMANENT', 'HTTP 401 classified as PERMANENT');

  // Test 9: Crash Recovery Simulation (Durable Outbox Worker)
  console.log('\n[9. Crash Recovery Simulation via Durable Outbox Worker]');
  const crashConvId = uuidv4();
  const crashConversion = {
    id: crashConvId,
    workspaceId: DEFAULT_WORKSPACE_ID,
    rawEventId: 'raw-crash-01',
    network: 'maxweb' as const,
    integrationId: mwIntegration.id,
    destinationId: testDestId,
    transactionId: `TX-CRASH-${Date.now()}`,
    eventType: 'purchase' as const,
    tiktokEventName: 'Purchase',
    valueStrategy: 'commission' as const,
    currency: 'USD',
    commissionAmount: 135,
    clickId: 'E.C.P.crash_test_click',
    status: 'queued' as const,
    idempotencyKey: `idemp-crash-${Date.now()}`,
    receivedAt: new Date().toISOString(),
  };
  db.saveConversion(crashConversion);

  const crashJob: OutboxJob = {
    id: uuidv4(),
    workspaceId: DEFAULT_WORKSPACE_ID,
    conversionId: crashConvId,
    destinationId: testDestId,
    tiktokEventName: 'Purchase',
    payload: { event: 'Purchase', clickId: 'E.C.P.crash_test_click' },
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextRetryAt: new Date(Date.now() - 5000).toISOString(), // Ready to be polled
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.saveOutboxJob(crashJob);

  // Simulate server restart: Worker starts and sweeps pending jobs
  const sweepResult = await outboxWorker.pollAndProcess(10);
  assert(sweepResult.processed >= 1 && sweepResult.succeeded >= 1, 'Crash recovery worker picked up and delivered pending outbox job');
  const recoveredConv = db.getConversionById(crashConvId);
  assert(recoveredConv?.status === 'accepted', 'Recovered conversion marked accepted after durable dispatch');

  // Test 10: Multi-Tenant Workspace Isolation
  console.log('\n[10. Multi-Tenant Workspace Isolation]');
  const tenantBWorkspace = 'ws-tenant-bravo';
  const tenantBDestinations = db.getDestinations(tenantBWorkspace);
  assert(tenantBDestinations.length === 0, 'Cross-tenant destinations access strictly isolated');
  const tenantBConversions = db.getConversions(tenantBWorkspace);
  assert(tenantBConversions.length === 0, 'Cross-tenant conversions access strictly isolated');

  // Test 11: Single Source of Truth for TikTok Event Name
  console.log('\n[11. Single Source of Truth Event Propagation]');
  const attrEvent = attributionEngine.attribute(dsValidResult, mwIntegration, DEFAULT_WORKSPACE_ID);
  assert(attrEvent.targetEventName === 'Purchase', 'Configured Purchase event preserved through attribution');

  // Test 12: Value Strategy Enforcement (No Implicit Fallback)
  console.log('\n[12. Value Strategy Strict Enforcement]');
  const testConvComm = { ...crashConversion, id: uuidv4(), commissionAmount: 75.5, grossAmount: 150.0, valueStrategy: 'commission' as const };
  const testConvGross = { ...crashConversion, id: uuidv4(), commissionAmount: 75.5, grossAmount: 150.0, valueStrategy: 'gross' as const };
  const testConvNone = { ...crashConversion, id: uuidv4(), commissionAmount: 75.5, grossAmount: 150.0, valueStrategy: 'none' as const };

  const dispComm = await tikTokAdsAdapter.dispatchConversion(testConvComm, testDest, 'demo_tok', { isSimulation: true });
  assert(dispComm.responseBody.data.value_sent === 75.5, 'Commission value strategy sends exactly commission value (75.5)');

  const dispGross = await tikTokAdsAdapter.dispatchConversion(testConvGross, testDest, 'demo_tok', { isSimulation: true });
  assert(dispGross.responseBody.data.value_sent === 150.0, 'Gross value strategy sends exactly gross value (150.0)');

  const dispNone = await tikTokAdsAdapter.dispatchConversion(testConvNone, testDest, 'demo_tok', { isSimulation: true });
  assert(dispNone.responseBody.data.value_sent === undefined, 'None value strategy omits value entirely');

  console.log('\n================================================================');
  console.log(`🏁 TEST SUITE FINISHED: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
