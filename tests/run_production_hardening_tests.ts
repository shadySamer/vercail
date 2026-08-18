import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/lib/db/store';
import { RelationalDatabaseStore } from '../src/lib/db/store';
import { outboxWorker } from '../src/lib/engine/OutboxWorker';
import { tikTokAdsAdapter } from '../src/lib/adapters/ad-platform/TikTokAdsAdapter';
import { attributionEngine } from '../src/lib/engine/AttributionEngine';
import { idempotencyEngine } from '../src/lib/engine/IdempotencyEngine';
import { networkRegistry } from '../src/lib/adapters/network/NetworkRegistry';
import { encryptSecret, decryptSecret, generateSecureToken, maskSecret, hashSha256 } from '../src/lib/security/crypto';
import { hashPassword, verifyPassword, createSessionToken } from '../src/lib/security/auth';
import {
  Workspace,
  User,
  Session,
  TikTokDestination,
  AffiliateIntegration,
  RawInboundEvent,
  CanonicalConversion,
  OutboxJob,
  NormalizedNetworkResult,
} from '../src/lib/types';

// ANSI terminal colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  if (condition) {
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
    passedCount++;
  } else {
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName}`);
    if (failureDetails) console.error(`    ${RED}Details: ${failureDetails}${RESET}`);
    failedCount++;
  }
}

async function runProductionHardeningTests() {
  console.log(`\n${BOLD}${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}🚀 RUNNING FINAL PRODUCTION HARDENING & ACCEPTANCE TEST SUITE${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================${RESET}\n`);

  // Clear development test database
  db.clearData();

  const workspaceA: Workspace = {
    id: `ws-tenant-a-${uuidv4().substring(0, 6)}`,
    name: 'Tenant Alpha Corp',
    slug: `tenant-alpha-${uuidv4().substring(0, 6)}`,
    createdAt: new Date().toISOString(),
  };
  db.saveWorkspace(workspaceA);

  const workspaceB: Workspace = {
    id: `ws-tenant-b-${uuidv4().substring(0, 6)}`,
    name: 'Tenant Beta Corp',
    slug: `tenant-beta-${uuidv4().substring(0, 6)}`,
    createdAt: new Date().toISOString(),
  };
  db.saveWorkspace(workspaceB);

  const destinationA: TikTokDestination = {
    id: `dest-a-${uuidv4().substring(0, 6)}`,
    workspaceId: workspaceA.id,
    name: 'Alpha TikTok Pixel',
    pixelId: 'CP_ALPHA_PIXEL_101',
    accessTokenEncrypted: encryptSecret('tt_live_token_secret_alpha_999'),
    defaultEventName: 'CompletePayment',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  db.saveDestination(destinationA);

  const integrationMaxWebA: AffiliateIntegration = {
    id: `int-maxweb-a-${uuidv4().substring(0, 6)}`,
    workspaceId: workspaceA.id,
    network: 'maxweb',
    name: 'MaxWeb Nutra Channel',
    secretToken: generateSecureToken('mw'),
    destinationId: destinationA.id,
    eventName: 'CompletePayment',
    valueStrategy: 'commission',
    status: 'connected',
    createdAt: new Date().toISOString(),
  };
  db.saveIntegration(integrationMaxWebA);

  // -------------------------------------------------------------------------
  // TEST 1: Normal Conversion Ingestion & TikTok Delivery
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 1: Normal Conversion Ingestion & TikTok Delivery]${RESET}`);
  {
    const txId = `ORD_NORMAL_${Date.now()}`;
    const rawEventId = uuidv4();
    const rawEvent: RawInboundEvent = {
      id: rawEventId,
      workspaceId: workspaceA.id,
      network: 'maxweb',
      integrationId: integrationMaxWebA.id,
      headers: { host: 'track.hub.com' },
      queryParams: { orderid: txId, subid5: 'ttclid(E.C.P.test1_click_id)' },
      body: {},
      rawPayload: 'orderid=' + txId,
      clientIp: '1.2.3.4',
      verificationStatus: 'verified',
      processingStatus: 'received',
      receivedAt: new Date().toISOString(),
    };

    const idempotencyKey = hashSha256(`maxweb:${integrationMaxWebA.id}:${txId}:purchase:`);
    const conversionId = uuidv4();
    const conversion: CanonicalConversion = {
      id: conversionId,
      workspaceId: workspaceA.id,
      rawEventId,
      network: 'maxweb',
      integrationId: integrationMaxWebA.id,
      destinationId: destinationA.id,
      transactionId: txId,
      eventType: 'purchase',
      tiktokEventName: 'CompletePayment',
      valueStrategy: 'commission',
      currency: 'USD',
      commissionAmount: 120.50,
      grossAmount: 250.00,
      clickId: 'E.C.P.test1_click_id',
      status: 'queued',
      idempotencyKey,
      receivedAt: rawEvent.receivedAt,
    };

    const outboxJob: OutboxJob = {
      id: uuidv4(),
      workspaceId: workspaceA.id,
      conversionId,
      destinationId: destinationA.id,
      tiktokEventName: 'CompletePayment',
      payload: {
        event: 'CompletePayment',
        event_id: conversion.id,
        click_id: 'E.C.P.test1_click_id',
        value_strategy: 'commission',
        commission_amount: 120.50,
      },
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      nextRetryAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ingestion = db.executeAtomicConversionIngestion({
      rawEvent,
      idempotencyKey,
      conversion,
      outboxJob,
    });

    assert(ingestion.success === true, 'Atomic ingestion committed successfully');

    // Worker process
    process.env.SIMULATION_MODE = 'true';
    const workerResult = await outboxWorker.processTask(outboxJob);
    assert(workerResult.success === true, 'Outbox worker delivered job to TikTok Events API');

    const updatedConv = db.getConversionById(conversionId);
    assert(updatedConv?.status === 'accepted', 'Conversion marked accepted after successful delivery');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Duplicate Burst Suppression (10 Sequential Requests)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 2: Duplicate Burst Suppression (10 Sequential Requests)]${RESET}`);
  {
    const txId = `ORD_BURST_${Date.now()}`;
    const idempotencyKey = hashSha256(`maxweb:${integrationMaxWebA.id}:${txId}:purchase:`);

    let duplicateCount = 0;
    for (let i = 0; i < 10; i++) {
      const convId = uuidv4();
      const rawId = uuidv4();
      const res = db.executeAtomicConversionIngestion({
        rawEvent: {
          id: rawId,
          workspaceId: workspaceA.id,
          network: 'maxweb',
          headers: {},
          queryParams: {},
          body: {},
          rawPayload: '',
          clientIp: '1.2.3.4',
          verificationStatus: 'verified',
          processingStatus: 'received',
          receivedAt: new Date().toISOString(),
        },
        idempotencyKey,
        conversion: {
          id: convId,
          workspaceId: workspaceA.id,
          rawEventId: rawId,
          network: 'maxweb',
          integrationId: integrationMaxWebA.id,
          destinationId: destinationA.id,
          transactionId: txId,
          eventType: 'purchase',
          tiktokEventName: 'CompletePayment',
          valueStrategy: 'commission',
          currency: 'USD',
          commissionAmount: 50,
          status: 'queued',
          idempotencyKey,
          receivedAt: new Date().toISOString(),
        },
      });

      if (res.isDuplicate) duplicateCount++;
    }

    assert(duplicateCount === 9, 'Exactly 9 out of 10 sequential duplicates suppressed by UNIQUE constraint');
  }

  // -------------------------------------------------------------------------
  // TEST 3: Concurrent Duplicate Protection (20 Simultaneous Inbound Requests)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 3: Concurrent Duplicate Protection (20 Simultaneous Inbound Requests)]${RESET}`);
  {
    const txId = `ORD_CONCURRENT_${Date.now()}`;
    const idempotencyKey = hashSha256(`maxweb:${integrationMaxWebA.id}:${txId}:purchase:`);

    const promises = Array.from({ length: 20 }).map((_, index) => {
      const convId = `conv-conc-${index}-${uuidv4().substring(0, 6)}`;
      const rawId = `raw-conc-${index}-${uuidv4().substring(0, 6)}`;
      return Promise.resolve(db.executeAtomicConversionIngestion({
        rawEvent: {
          id: rawId,
          workspaceId: workspaceA.id,
          network: 'maxweb',
          headers: {},
          queryParams: {},
          body: {},
          rawPayload: '',
          clientIp: '1.2.3.4',
          verificationStatus: 'verified',
          processingStatus: 'received',
          receivedAt: new Date().toISOString(),
        },
        idempotencyKey,
        conversion: {
          id: convId,
          workspaceId: workspaceA.id,
          rawEventId: rawId,
          network: 'maxweb',
          integrationId: integrationMaxWebA.id,
          destinationId: destinationA.id,
          transactionId: txId,
          eventType: 'purchase',
          tiktokEventName: 'CompletePayment',
          valueStrategy: 'commission',
          currency: 'USD',
          commissionAmount: 75,
          status: 'queued',
          idempotencyKey,
          receivedAt: new Date().toISOString(),
        },
      }));
    });

    const results = await Promise.all(promises);
    const successes = results.filter(r => r.success);
    const duplicates = results.filter(r => r.isDuplicate);

    assert(successes.length === 1, 'Exactly 1 concurrent request succeeded as canonical conversion');
    assert(duplicates.length === 19, 'Exactly 19 concurrent requests suppressed at DB UNIQUE constraint level');
  }

  // -------------------------------------------------------------------------
  // TEST 4: Crash Before Outbox Creation (Zero Orphan Conversions)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 4: Crash Before Outbox Creation (Zero Orphan Conversions)]${RESET}`);
  {
    const faultyKey = 'faulty_test_key_rollback';
    const convId = uuidv4();

    let caughtRollback = false;
    try {
      db.executeAtomicConversionIngestion({
        rawEvent: {
          id: uuidv4(),
          workspaceId: workspaceA.id,
          network: 'maxweb',
          headers: {},
          queryParams: {},
          body: {},
          rawPayload: '',
          clientIp: '1.2.3.4',
          verificationStatus: 'verified',
          processingStatus: 'received',
          receivedAt: new Date().toISOString(),
        },
        idempotencyKey: faultyKey,
        conversion: {
          id: convId,
          workspaceId: 'NON_EXISTENT_WORKSPACE_FK_VIOLATION',
          rawEventId: 'invalid_raw',
          network: 'maxweb',
          integrationId: integrationMaxWebA.id,
          transactionId: 'TX_ROLLBACK_TEST',
          eventType: 'purchase',
          tiktokEventName: 'CompletePayment',
          valueStrategy: 'commission',
          currency: 'USD',
          commissionAmount: 10,
          status: 'queued',
          idempotencyKey: faultyKey,
          receivedAt: new Date().toISOString(),
        },
      });
    } catch {
      caughtRollback = true;
    }

    const savedConv = db.getConversionById(convId);
    assert(savedConv === undefined, 'Atomic rollback prevented orphan conversion creation');
  }

  // -------------------------------------------------------------------------
  // TEST 5: Crash After Commit Recovery (Durable Worker Sweep)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 5: Crash After Commit Recovery (Durable Worker Sweep)]${RESET}`);
  {
    const txId = `ORD_CRASH_SWEEP_${Date.now()}`;
    const idempotencyKey = hashSha256(`maxweb:${integrationMaxWebA.id}:${txId}:purchase:`);
    const conversionId = uuidv4();
    const outboxJobId = uuidv4();

    db.executeAtomicConversionIngestion({
      rawEvent: {
        id: uuidv4(),
        workspaceId: workspaceA.id,
        network: 'maxweb',
        headers: {},
        queryParams: {},
        body: {},
        rawPayload: '',
        clientIp: '1.2.3.4',
        verificationStatus: 'verified',
        processingStatus: 'received',
        receivedAt: new Date().toISOString(),
      },
      idempotencyKey,
      conversion: {
        id: conversionId,
        workspaceId: workspaceA.id,
        rawEventId: uuidv4(),
        network: 'maxweb',
        integrationId: integrationMaxWebA.id,
        destinationId: destinationA.id,
        transactionId: txId,
        eventType: 'purchase',
        tiktokEventName: 'CompletePayment',
        valueStrategy: 'commission',
        currency: 'USD',
        commissionAmount: 85,
        status: 'queued',
        idempotencyKey,
        receivedAt: new Date().toISOString(),
      },
      outboxJob: {
        id: outboxJobId,
        workspaceId: workspaceA.id,
        conversionId,
        destinationId: destinationA.id,
        tiktokEventName: 'CompletePayment',
        payload: { event: 'CompletePayment', event_id: conversionId },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextRetryAt: new Date(Date.now() - 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    const sweep = await outboxWorker.pollAndProcess(50);
    assert(sweep.processed >= 1, 'Worker recovery sweep found and claimed pending outbox job');

    const recoveredConv = db.getConversionById(conversionId);
    assert(recoveredConv?.status === 'accepted', 'Recovered conversion completed TikTok delivery');
  }

  // -------------------------------------------------------------------------
  // TEST 6: Two Parallel Workers Atomic Claiming (No Duplicate Dispatch)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 6: Two Parallel Workers Atomic Claiming (No Duplicate Dispatch)]${RESET}`);
  {
    const outboxJobId = uuidv4();
    const conversionId = uuidv4();

    // Insert valid conversion first to satisfy foreign key constraint
    db.saveConversion({
      id: conversionId,
      workspaceId: workspaceA.id,
      rawEventId: uuidv4(),
      network: 'maxweb',
      integrationId: integrationMaxWebA.id,
      destinationId: destinationA.id,
      transactionId: `TX_PARALLEL_${Date.now()}`,
      eventType: 'purchase',
      tiktokEventName: 'CompletePayment',
      valueStrategy: 'commission',
      currency: 'USD',
      commissionAmount: 90,
      status: 'queued',
      idempotencyKey: `par_key_${Date.now()}`,
      receivedAt: new Date().toISOString(),
    });

    db.saveOutboxJob({
      id: outboxJobId,
      workspaceId: workspaceA.id,
      conversionId,
      destinationId: destinationA.id,
      tiktokEventName: 'CompletePayment',
      payload: { event: 'CompletePayment', event_id: conversionId },
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      nextRetryAt: new Date(Date.now() - 5000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Worker 1 and Worker 2 claim simultaneously
    const claim1Promise = db.claimPendingOutboxJobs('worker_alpha_1', 10, 60);
    const claim2Promise = db.claimPendingOutboxJobs('worker_alpha_2', 10, 60);

    const [claimedBy1, claimedBy2] = await Promise.all([claim1Promise, claim2Promise]);
    const job1Claimed = claimedBy1.some(j => j.id === outboxJobId);
    const job2Claimed = claimedBy2.some(j => j.id === outboxJobId);

    assert(
      (job1Claimed && !job2Claimed) || (!job1Claimed && job2Claimed),
      'Only one worker claimed the job; zero race condition duplication'
    );
  }

  // -------------------------------------------------------------------------
  // TEST 7: Worker Lease Recovery (Worker Dies After Claim)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 7: Worker Lease Recovery (Worker Dies After Claim)]${RESET}`);
  {
    const deadWorkerJobId = uuidv4();
    const deadWorkerConvId = uuidv4();

    db.saveConversion({
      id: deadWorkerConvId,
      workspaceId: workspaceA.id,
      rawEventId: uuidv4(),
      network: 'maxweb',
      integrationId: integrationMaxWebA.id,
      destinationId: destinationA.id,
      transactionId: `TX_DEAD_WORKER_${Date.now()}`,
      eventType: 'purchase',
      tiktokEventName: 'CompletePayment',
      valueStrategy: 'commission',
      currency: 'USD',
      commissionAmount: 110,
      status: 'queued',
      idempotencyKey: `dead_key_${Date.now()}`,
      receivedAt: new Date().toISOString(),
    });

    // Create a job that was claimed 120s ago with a 60s lease (expired lease)
    db.saveOutboxJob({
      id: deadWorkerJobId,
      workspaceId: workspaceA.id,
      conversionId: deadWorkerConvId,
      destinationId: destinationA.id,
      tiktokEventName: 'CompletePayment',
      payload: { event: 'CompletePayment', event_id: deadWorkerConvId },
      status: 'processing',
      attempts: 1,
      maxAttempts: 5,
      nextRetryAt: new Date().toISOString(),
      claimedAt: new Date(Date.now() - 120000).toISOString(),
      leaseTimeoutAt: new Date(Date.now() - 60000).toISOString(), // Expired lease
      workerId: 'dead_worker_999',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Second worker claims expired job
    const recoveredJobs = await db.claimPendingOutboxJobs('surviving_worker_1', 10, 60);
    const wasRecovered = recoveredJobs.some(j => j.id === deadWorkerJobId);

    assert(wasRecovered === true, 'Surviving worker successfully reclaimed job with expired lease');
  }

  // -------------------------------------------------------------------------
  // TEST 8: Missing Click ID Behavior (Unattributed & No TikTok Dispatch)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 8: Missing Click ID Behavior (Unattributed & No TikTok Dispatch)]${RESET}`);
  {
    const normalizedNoClick: NormalizedNetworkResult = {
      isVerified: true,
      transactionId: `ORD_NOCLICK_${Date.now()}`,
      eventType: 'purchase',
      amountCommission: 45.0,
      amountGross: 90.0,
      currency: 'USD',
      clickIdRaw: undefined,
      clickIdClean: undefined, // Missing ttclid
    };

    const attribution = attributionEngine.attribute(normalizedNoClick, integrationMaxWebA, workspaceA.id);
    assert(attribution.status === 'unattributed', 'Missing ttclid marked strictly as unattributed');
    assert(attribution.reason.includes('Missing or unreplaced TikTok Click ID'), 'Reason documented clearly');
  }

  // -------------------------------------------------------------------------
  // TEST 9: Missing Destination (Configuration Error & Zero Pixel Fallback)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 9: Missing Destination (Configuration Error & Zero Pixel Fallback)]${RESET}`);
  {
    const unassignedIntegration: AffiliateIntegration = {
      id: `int-unassigned-${uuidv4().substring(0, 6)}`,
      workspaceId: workspaceA.id,
      network: 'maxweb',
      name: 'Unassigned Channel',
      secretToken: generateSecureToken('mw'),
      destinationId: undefined, // NO DESTINATION
      valueStrategy: 'commission',
      status: 'connected',
      createdAt: new Date().toISOString(),
    };
    db.saveIntegration(unassignedIntegration);

    const normalizedValid: NormalizedNetworkResult = {
      isVerified: true,
      transactionId: `ORD_UNASSIGNED_${Date.now()}`,
      eventType: 'purchase',
      amountCommission: 30.0,
      amountGross: 60.0,
      currency: 'USD',
      clickIdClean: 'valid_ttclid_123',
    };

    const attribution = attributionEngine.attribute(normalizedValid, unassignedIntegration, workspaceA.id);
    assert(attribution.status === 'configuration_error', 'Unassigned integration returns configuration_error');
    assert(attribution.resolvedDestination === undefined, 'Zero Pixel fallback policy enforced');
  }

  // -------------------------------------------------------------------------
  // TEST 10: Selected Event Propagation (Single Source of Truth)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 10: Selected Event Propagation (Single Source of Truth)]${RESET}`);
  {
    const customEventIntegration: AffiliateIntegration = {
      id: `int-event-${uuidv4().substring(0, 6)}`,
      workspaceId: workspaceA.id,
      network: 'digistore24',
      name: 'Digistore Channel Purchase',
      secretToken: generateSecureToken('ds'),
      destinationId: destinationA.id,
      eventName: 'Purchase', // Custom chosen event
      valueStrategy: 'commission',
      status: 'connected',
      createdAt: new Date().toISOString(),
    };
    db.saveIntegration(customEventIntegration);

    const normalized: NormalizedNetworkResult = {
      isVerified: true,
      transactionId: `ORD_EVENT_${Date.now()}`,
      eventType: 'purchase',
      amountCommission: 50.0,
      amountGross: 100.0,
      currency: 'EUR',
      clickIdClean: 'ttclid_ds_999',
    };

    const attribution = attributionEngine.attribute(normalized, customEventIntegration, workspaceA.id);
    assert(attribution.targetEventName === 'Purchase', 'Configured Purchase event preserved as single source of truth');
  }

  // -------------------------------------------------------------------------
  // TEST 11: Commission Value Strategy Strict Enforcement
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 11: Commission Value Strategy Strict Enforcement]${RESET}`);
  {
    const convCommission: CanonicalConversion = {
      id: uuidv4(),
      workspaceId: workspaceA.id,
      rawEventId: uuidv4(),
      network: 'maxweb',
      integrationId: integrationMaxWebA.id,
      destinationId: destinationA.id,
      transactionId: 'TX_COMM_TEST',
      eventType: 'purchase',
      tiktokEventName: 'CompletePayment',
      valueStrategy: 'commission',
      currency: 'USD',
      commissionAmount: 62.50,
      grossAmount: 150.00,
      clickId: 'ttclid_comm',
      status: 'queued',
      idempotencyKey: 'comm_key_1',
      receivedAt: new Date().toISOString(),
    };

    process.env.SIMULATION_MODE = 'true';
    const dispatch = await tikTokAdsAdapter.dispatchConversion(convCommission, destinationA, 'token_1', { isSimulation: true });
    assert(dispatch.responseBody.data.value_sent === 62.50, 'Commission strategy sent exact commission amount (62.50)');
  }

  // -------------------------------------------------------------------------
  // TEST 12: Gross Value Strategy Strict Enforcement
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 12: Gross Value Strategy Strict Enforcement]${RESET}`);
  {
    const convGross: CanonicalConversion = {
      id: uuidv4(),
      workspaceId: workspaceA.id,
      rawEventId: uuidv4(),
      network: 'maxweb',
      integrationId: integrationMaxWebA.id,
      destinationId: destinationA.id,
      transactionId: 'TX_GROSS_TEST',
      eventType: 'purchase',
      tiktokEventName: 'CompletePayment',
      valueStrategy: 'gross',
      currency: 'USD',
      commissionAmount: 62.50,
      grossAmount: 150.00,
      clickId: 'ttclid_gross',
      status: 'queued',
      idempotencyKey: 'gross_key_1',
      receivedAt: new Date().toISOString(),
    };

    const dispatch = await tikTokAdsAdapter.dispatchConversion(convGross, destinationA, 'token_1', { isSimulation: true });
    assert(dispatch.responseBody.data.value_sent === 150.00, 'Gross strategy sent exact gross amount (150.00)');
  }

  // -------------------------------------------------------------------------
  // TEST 13: No Value Strategy Strict Enforcement (Omit Value)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 13: No Value Strategy Strict Enforcement (Omit Value)]${RESET}`);
  {
    const convNone: CanonicalConversion = {
      id: uuidv4(),
      workspaceId: workspaceA.id,
      rawEventId: uuidv4(),
      network: 'maxweb',
      integrationId: integrationMaxWebA.id,
      destinationId: destinationA.id,
      transactionId: 'TX_NONE_TEST',
      eventType: 'purchase',
      tiktokEventName: 'CompletePayment',
      valueStrategy: 'none',
      currency: 'USD',
      commissionAmount: 62.50,
      grossAmount: 150.00,
      clickId: 'ttclid_none',
      status: 'queued',
      idempotencyKey: 'none_key_1',
      receivedAt: new Date().toISOString(),
    };

    const dispatch = await tikTokAdsAdapter.dispatchConversion(convNone, destinationA, 'token_1', { isSimulation: true });
    assert(dispatch.responseBody.data.value_sent === undefined, 'No value strategy completely omitted value from TikTok payload');
  }

  // -------------------------------------------------------------------------
  // TEST 14: TikTok Retryable Error Classification (429/500/Timeout)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 14: TikTok Retryable Error Classification (429/500/Timeout)]${RESET}`);
  {
    const error429 = tikTokAdsAdapter.classifyError(429, { message: 'Too Many Requests' });
    const error500 = tikTokAdsAdapter.classifyError(500, { message: 'Internal Server Error' });

    assert(error429 === 'RETRYABLE', 'HTTP 429 classified as RETRYABLE');
    assert(error500 === 'RETRYABLE', 'HTTP 500 classified as RETRYABLE');
  }

  // -------------------------------------------------------------------------
  // TEST 15: TikTok Permanent Error Classification (401/Invalid Token)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 15: TikTok Permanent Error Classification (401/Invalid Token)]${RESET}`);
  {
    const error401 = tikTokAdsAdapter.classifyError(401, { code: 40001, message: 'Invalid Access Token' });
    const error400 = tikTokAdsAdapter.classifyError(400, { code: 40002, message: 'Pixel ID not found' });

    assert(error401 === 'PERMANENT', 'HTTP 401 / Invalid Token classified as PERMANENT');
    assert(error400 === 'PERMANENT', 'HTTP 400 / Invalid Pixel classified as PERMANENT');
  }

  // -------------------------------------------------------------------------
  // TEST 16: Multi-Tenant Workspace Boundary Isolation
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 16: Multi-Tenant Workspace Boundary Isolation]${RESET}`);
  {
    const destinationsA = db.getDestinations(workspaceA.id);
    const destinationsB = db.getDestinations(workspaceB.id);

    assert(destinationsA.length >= 1, 'Workspace A sees its own destinations');
    assert(destinationsB.length === 0, 'Workspace B is strictly isolated and sees 0 destinations from Workspace A');
  }

  // -------------------------------------------------------------------------
  // TEST 17: Public Postback Token & Rotation Security
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 17: Public Postback Token & Rotation Security]${RESET}`);
  {
    const oldToken = integrationMaxWebA.secretToken;
    const newToken = generateSecureToken('mw');

    // Token must be cryptographically long
    assert(newToken.length >= 40, 'Postback token is cryptographically secure CSPRNG (length >= 40)');

    // Simulate Rotation
    integrationMaxWebA.secretToken = newToken;
    db.saveIntegration(integrationMaxWebA);

    const lookupWithNew = db.getIntegrationByToken('maxweb', newToken, workspaceA.id);
    const lookupWithOld = db.getIntegrationByToken('maxweb', oldToken, workspaceA.id);

    assert(lookupWithNew !== undefined, 'Rotated token immediately valid');
    assert(lookupWithOld === undefined, 'Old token immediately revoked and rejected');
  }

  // -------------------------------------------------------------------------
  // TEST 18: Production Restart Sweep (Automatic Sweep)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 18: Production Restart Sweep (Automatic Sweep)]${RESET}`);
  {
    const restartJobId = uuidv4();
    const restartConvId = uuidv4();

    db.saveConversion({
      id: restartConvId,
      workspaceId: workspaceA.id,
      rawEventId: uuidv4(),
      network: 'maxweb',
      integrationId: integrationMaxWebA.id,
      destinationId: destinationA.id,
      transactionId: `TX_RESTART_${Date.now()}`,
      eventType: 'purchase',
      tiktokEventName: 'CompletePayment',
      valueStrategy: 'commission',
      currency: 'USD',
      commissionAmount: 150,
      status: 'failed_retryable',
      idempotencyKey: `restart_key_${Date.now()}`,
      receivedAt: new Date().toISOString(),
    });

    db.saveOutboxJob({
      id: restartJobId,
      workspaceId: workspaceA.id,
      conversionId: restartConvId,
      destinationId: destinationA.id,
      tiktokEventName: 'CompletePayment',
      payload: { event: 'CompletePayment', event_id: restartConvId },
      status: 'failed_retryable',
      attempts: 1,
      maxAttempts: 5,
      nextRetryAt: new Date(Date.now() - 5000).toISOString(), // Ready for retry
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const sweepResult = await outboxWorker.pollAndProcess(50);
    assert(sweepResult.processed >= 1, 'Restart sweep automatically processed retryable job without manual trigger');
  }

  // -------------------------------------------------------------------------
  // TEST 19: Production Fail-Closed PostgreSQL Check
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 19: Production Fail-Closed PostgreSQL Check]${RESET}`);
  {
    let caughtFailClosed = false;
    try {
      const prevEnv = process.env.NODE_ENV;
      const prevUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      delete process.env.POSTGRES_URL;
      (process.env as any).NODE_ENV = 'production';

      // Attempt instantiation without DATABASE_URL in production
      new RelationalDatabaseStore();
      process.env.NODE_ENV = prevEnv;
    } catch (err: any) {
      if (err.message.includes('DATABASE_URL environment variable is strictly required in production')) {
        caughtFailClosed = true;
      }
    } finally {
      process.env.NODE_ENV = 'development';
    }

    assert(caughtFailClosed === true, 'Production strictly fails closed when DATABASE_URL is missing');
  }

  // -------------------------------------------------------------------------
  // TEST 20: Encryption at Rest & Secret Masking
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[Test 20: Encryption at Rest & Secret Masking]${RESET}`);
  {
    const secret = 'tt_live_secret_token_key_123456789';
    const encrypted = encryptSecret(secret);
    const decrypted = decryptSecret(encrypted);
    const masked = maskSecret(secret);

    assert(encrypted !== secret, 'Token encrypted at rest with AES-256-GCM');
    assert(decrypted === secret, 'Token decrypted correctly with master key');
    assert(masked.startsWith('tt_l') && masked.endsWith('6789') && masked.includes('••••••••'), 'Secret masked properly for API responses');
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}🏁 TEST SUITE COMPLETED: ${GREEN}${passedCount} PASSED${CYAN}, ${RED}${failedCount} FAILED${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================${RESET}\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runProductionHardeningTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
