import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {
  Workspace,
  User,
  TikTokDestination,
  AffiliateIntegration,
  RawInboundEvent,
  CanonicalConversion,
  OutboxJob,
  DeliveryAttempt,
  IntegrationHealth,
  NetworkType,
} from '../types';

class RelationalDatabaseStore {
  private db!: Database.Database;

  constructor() {
    this.initDatabase();
  }

  private initDatabase() {
    try {
      const isVercel = !!process.env.VERCEL;
      let dataDir: string;

      if (isVercel) {
        dataDir = '/tmp';
      } else {
        dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
          try {
            fs.mkdirSync(dataDir, { recursive: true });
          } catch {
            dataDir = path.join(process.cwd());
          }
        }
      }

      const dbPath = path.join(dataDir, 'hub_production.sqlite');
      this.db = new Database(dbPath);

      // Pragmas for performance and durability
      try {
        this.db.pragma('journal_mode = WAL');
      } catch {
        // WAL may not be supported on all serverless filesystems; fallback to default
      }
      this.db.pragma('synchronous = NORMAL');

      this.initSchema();
    } catch (err) {
      console.warn('SQLite init fallback to in-memory:', err);
      this.db = new Database(':memory:');
      this.initSchema();
    }
  }

  private initSchema() {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'owner',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tiktok_destinations (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          name TEXT NOT NULL,
          pixel_id TEXT NOT NULL,
          access_token_encrypted TEXT NOT NULL,
          default_event_name TEXT NOT NULL DEFAULT 'CompletePayment',
          test_event_code TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS affiliate_integrations (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          network TEXT NOT NULL,
          name TEXT NOT NULL,
          secret_token TEXT NOT NULL UNIQUE,
          webhook_secret_encrypted TEXT,
          destination_id TEXT,
          event_name TEXT,
          value_strategy TEXT NOT NULL DEFAULT 'commission',
          status TEXT NOT NULL DEFAULT 'connected',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS raw_inbound_events (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          network TEXT NOT NULL,
          integration_id TEXT,
          headers TEXT NOT NULL,
          query_params TEXT NOT NULL,
          body TEXT NOT NULL,
          raw_payload TEXT NOT NULL,
          client_ip TEXT NOT NULL,
          verification_status TEXT NOT NULL,
          processing_status TEXT NOT NULL,
          error_message TEXT,
          received_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS idempotency_records (
          idempotency_key TEXT PRIMARY KEY,
          conversion_id TEXT NOT NULL,
          network TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conversions (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          raw_event_id TEXT NOT NULL,
          network TEXT NOT NULL,
          integration_id TEXT NOT NULL,
          destination_id TEXT,
          transaction_id TEXT NOT NULL,
          parent_transaction_id TEXT,
          order_item_id TEXT,
          event_type TEXT NOT NULL,
          tiktok_event_name TEXT NOT NULL,
          value_strategy TEXT NOT NULL DEFAULT 'commission',
          currency TEXT NOT NULL,
          commission_amount REAL NOT NULL DEFAULT 0,
          gross_amount REAL,
          click_id TEXT,
          status TEXT NOT NULL,
          idempotency_key TEXT NOT NULL UNIQUE,
          error_message TEXT,
          received_at TEXT NOT NULL,
          processed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS outbox_jobs (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          conversion_id TEXT NOT NULL,
          destination_id TEXT NOT NULL,
          tiktok_event_name TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 5,
          next_retry_at TEXT NOT NULL,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS delivery_attempts (
          id TEXT PRIMARY KEY,
          outbox_job_id TEXT NOT NULL,
          conversion_id TEXT NOT NULL,
          destination_id TEXT NOT NULL,
          pixel_id TEXT NOT NULL,
          event_name TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          latency_ms INTEGER NOT NULL,
          request_payload TEXT NOT NULL,
          response_body TEXT NOT NULL,
          is_success INTEGER NOT NULL,
          error_classification TEXT,
          error_message TEXT,
          attempted_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS integration_health (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          integration_id TEXT NOT NULL UNIQUE,
          network TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'healthy',
          last_postback_at TEXT,
          last_conversion_at TEXT,
          last_tiktok_delivery_at TEXT,
          total_postbacks_received INTEGER NOT NULL DEFAULT 0,
          total_conversions_processed INTEGER NOT NULL DEFAULT 0,
          missing_click_id_count INTEGER NOT NULL DEFAULT 0,
          duplicate_count INTEGER NOT NULL DEFAULT 0,
          failed_deliveries_count INTEGER NOT NULL DEFAULT 0,
          attribution_rate REAL NOT NULL DEFAULT 100,
          delivery_rate REAL NOT NULL DEFAULT 100,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_conversions_workspace ON conversions(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_conversions_transaction ON conversions(integration_id, transaction_id);
        CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_jobs(status, next_retry_at);
        CREATE INDEX IF NOT EXISTS idx_raw_events_workspace ON raw_inbound_events(workspace_id);
      `);

      this.seedDefaults();
    } catch (err) {
      console.error('Schema initialization error:', err);
    }
  }

  private seedDefaults() {
    try {
      const wsCount = this.db.prepare('SELECT count(*) as c FROM workspaces').get() as any;
      if (!wsCount || wsCount.c === 0) {
        this.saveWorkspace({
          id: 'ws-master-01',
          name: 'Production Workspace',
          slug: 'production',
          createdAt: new Date().toISOString(),
        });
      }

      const intCount = this.db.prepare('SELECT count(*) as c FROM affiliate_integrations').get() as any;
      if (!intCount || intCount.c === 0) {
        const defaultNetworks: Array<{ network: NetworkType; name: string; token: string }> = [
          { network: 'maxweb', name: 'MaxWeb S2S Channel', token: 'mw_live_sec_884920' },
          { network: 'buygoods', name: 'BuyGoods S2S Channel', token: 'bg_live_sec_119284' },
          { network: 'digistore24', name: 'Digistore24 S2S Channel', token: 'ds_live_sec_994821' },
          { network: 'clickbank', name: 'ClickBank S2S Channel', token: 'cb_live_sec_772910' },
        ];

        for (const n of defaultNetworks) {
          const id = `int-${n.network}-01`;
          this.saveIntegration({
            id,
            workspaceId: 'ws-master-01',
            network: n.network,
            name: n.name,
            secretToken: n.token,
            valueStrategy: 'commission',
            status: 'connected',
            createdAt: new Date().toISOString(),
          });

          this.updateIntegrationHealth({
            id: `health-${n.network}-01`,
            workspaceId: 'ws-master-01',
            integrationId: id,
            network: n.network,
            status: 'healthy',
            totalPostbacksReceived: 0,
            totalConversionsProcessed: 0,
            missingClickIdCount: 0,
            duplicateCount: 0,
            failedDeliveriesCount: 0,
            attributionRate: 100,
            deliveryRate: 100,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn('Seed defaults notice:', err);
    }
  }

  // Workspaces
  public getWorkspaces(): Workspace[] {
    try {
      const rows = this.db.prepare('SELECT * FROM workspaces ORDER BY created_at ASC').all() as any[];
      return rows.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        createdAt: r.created_at,
      }));
    } catch {
      return [];
    }
  }

  public saveWorkspace(w: Workspace): void {
    this.db.prepare(`
      INSERT INTO workspaces (id, name, slug, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug
    `).run(w.id, w.name, w.slug, w.createdAt);
  }

  // TikTok Destinations
  public getDestinations(workspaceId?: string): TikTokDestination[] {
    try {
      const query = workspaceId
        ? this.db.prepare('SELECT * FROM tiktok_destinations WHERE workspace_id = ? ORDER BY created_at DESC')
        : this.db.prepare('SELECT * FROM tiktok_destinations ORDER BY created_at DESC');
      const rows = (workspaceId ? query.all(workspaceId) : query.all()) as any[];
      return rows.map(r => ({
        id: r.id,
        workspaceId: r.workspace_id,
        name: r.name,
        pixelId: r.pixel_id,
        accessTokenEncrypted: r.access_token_encrypted,
        defaultEventName: r.default_event_name,
        testEventCode: r.test_event_code || undefined,
        status: r.status,
        createdAt: r.created_at,
      }));
    } catch {
      return [];
    }
  }

  public getDestinationById(id: string, workspaceId?: string): TikTokDestination | undefined {
    try {
      const query = workspaceId
        ? this.db.prepare('SELECT * FROM tiktok_destinations WHERE id = ? AND workspace_id = ?')
        : this.db.prepare('SELECT * FROM tiktok_destinations WHERE id = ? OR pixel_id = ?');
      const r = (workspaceId ? query.get(id, workspaceId) : query.get(id, id)) as any;
      if (!r) return undefined;
      return {
        id: r.id,
        workspaceId: r.workspace_id,
        name: r.name,
        pixelId: r.pixel_id,
        accessTokenEncrypted: r.access_token_encrypted,
        defaultEventName: r.default_event_name,
        testEventCode: r.test_event_code || undefined,
        status: r.status,
        createdAt: r.created_at,
      };
    } catch {
      return undefined;
    }
  }

  public saveDestination(d: TikTokDestination): void {
    this.db.prepare(`
      INSERT INTO tiktok_destinations (id, workspace_id, name, pixel_id, access_token_encrypted, default_event_name, test_event_code, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        pixel_id = excluded.pixel_id,
        access_token_encrypted = excluded.access_token_encrypted,
        default_event_name = excluded.default_event_name,
        test_event_code = excluded.test_event_code,
        status = excluded.status
    `).run(
      d.id,
      d.workspaceId,
      d.name,
      d.pixelId,
      d.accessTokenEncrypted,
      d.defaultEventName || 'CompletePayment',
      d.testEventCode || null,
      d.status || 'active',
      d.createdAt
    );
  }

  public deleteDestination(id: string, workspaceId?: string): boolean {
    try {
      const stmt = workspaceId
        ? this.db.prepare('DELETE FROM tiktok_destinations WHERE id = ? AND workspace_id = ?')
        : this.db.prepare('DELETE FROM tiktok_destinations WHERE id = ?');
      const info = workspaceId ? stmt.run(id, workspaceId) : stmt.run(id);
      return info.changes > 0;
    } catch {
      return false;
    }
  }

  // Affiliate Integrations
  public getIntegrations(workspaceId?: string): AffiliateIntegration[] {
    try {
      const query = workspaceId
        ? this.db.prepare('SELECT * FROM affiliate_integrations WHERE workspace_id = ? ORDER BY created_at DESC')
        : this.db.prepare('SELECT * FROM affiliate_integrations ORDER BY created_at DESC');
      const rows = (workspaceId ? query.all(workspaceId) : query.all()) as any[];
      return rows.map(r => ({
        id: r.id,
        workspaceId: r.workspace_id,
        network: r.network as NetworkType,
        name: r.name,
        secretToken: r.secret_token,
        webhookSecretEncrypted: r.webhook_secret_encrypted || undefined,
        destinationId: r.destination_id || undefined,
        eventName: r.event_name || undefined,
        valueStrategy: (r.value_strategy || 'commission') as any,
        status: r.status,
        createdAt: r.created_at,
      }));
    } catch {
      return [];
    }
  }

  public getIntegrationByToken(network: NetworkType, token: string, workspaceId?: string): AffiliateIntegration | undefined {
    try {
      let stmt = workspaceId
        ? this.db.prepare('SELECT * FROM affiliate_integrations WHERE network = ? AND secret_token = ? AND workspace_id = ?')
        : this.db.prepare('SELECT * FROM affiliate_integrations WHERE network = ? AND secret_token = ?');
      const r = (workspaceId ? stmt.get(network, token, workspaceId) : stmt.get(network, token)) as any;
      if (!r) return undefined;
      return {
        id: r.id,
        workspaceId: r.workspace_id,
        network: r.network as NetworkType,
        name: r.name,
        secretToken: r.secret_token,
        webhookSecretEncrypted: r.webhook_secret_encrypted || undefined,
        destinationId: r.destination_id || undefined,
        eventName: r.event_name || undefined,
        valueStrategy: (r.value_strategy || 'commission') as any,
        status: r.status,
        createdAt: r.created_at,
      };
    } catch {
      return undefined;
    }
  }

  public getIntegrationById(id: string, workspaceId?: string): AffiliateIntegration | undefined {
    try {
      let stmt = workspaceId
        ? this.db.prepare('SELECT * FROM affiliate_integrations WHERE id = ? AND workspace_id = ?')
        : this.db.prepare('SELECT * FROM affiliate_integrations WHERE id = ?');
      const r = (workspaceId ? stmt.get(id, workspaceId) : stmt.get(id)) as any;
      if (!r) return undefined;
      return {
        id: r.id,
        workspaceId: r.workspace_id,
        network: r.network as NetworkType,
        name: r.name,
        secretToken: r.secret_token,
        webhookSecretEncrypted: r.webhook_secret_encrypted || undefined,
        destinationId: r.destination_id || undefined,
        eventName: r.event_name || undefined,
        valueStrategy: (r.value_strategy || 'commission') as any,
        status: r.status,
        createdAt: r.created_at,
      };
    } catch {
      return undefined;
    }
  }

  public deleteIntegration(id: string, workspaceId?: string): boolean {
    try {
      const stmt = workspaceId
        ? this.db.prepare('DELETE FROM affiliate_integrations WHERE id = ? AND workspace_id = ?')
        : this.db.prepare('DELETE FROM affiliate_integrations WHERE id = ?');
      const info = workspaceId ? stmt.run(id, workspaceId) : stmt.run(id);
      return info.changes > 0;
    } catch {
      return false;
    }
  }

  public saveIntegration(i: AffiliateIntegration): void {
    this.db.prepare(`
      INSERT INTO affiliate_integrations (id, workspace_id, network, name, secret_token, webhook_secret_encrypted, destination_id, event_name, value_strategy, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        network = excluded.network,
        name = excluded.name,
        secret_token = excluded.secret_token,
        webhook_secret_encrypted = excluded.webhook_secret_encrypted,
        destination_id = excluded.destination_id,
        event_name = excluded.event_name,
        value_strategy = excluded.value_strategy,
        status = excluded.status
    `).run(
      i.id,
      i.workspaceId,
      i.network,
      i.name,
      i.secretToken,
      i.webhookSecretEncrypted || null,
      i.destinationId || null,
      i.eventName || null,
      i.valueStrategy || 'commission',
      i.status || 'connected',
      i.createdAt
    );
  }

  // Raw Inbound Events
  public logRawInboundEvent(event: RawInboundEvent): void {
    try {
      this.db.prepare(`
        INSERT INTO raw_inbound_events (id, workspace_id, network, integration_id, headers, query_params, body, raw_payload, client_ip, verification_status, processing_status, error_message, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          verification_status = excluded.verification_status,
          processing_status = excluded.processing_status,
          error_message = excluded.error_message
      `).run(
        event.id,
        event.workspaceId,
        event.network,
        event.integrationId || null,
        JSON.stringify(event.headers || {}),
        JSON.stringify(event.queryParams || {}),
        JSON.stringify(event.body || {}),
        event.rawPayload || '',
        event.clientIp,
        event.verificationStatus,
        event.processingStatus,
        event.errorMessage || null,
        event.receivedAt
      );
    } catch (err) {
      console.error('Failed to log raw event:', err);
    }
  }

  public getRawEvents(workspaceId?: string, limit: number = 200): RawInboundEvent[] {
    try {
      const query = workspaceId
        ? this.db.prepare('SELECT * FROM raw_inbound_events WHERE workspace_id = ? ORDER BY received_at DESC LIMIT ?')
        : this.db.prepare('SELECT * FROM raw_inbound_events ORDER BY received_at DESC LIMIT ?');
      const rows = (workspaceId ? query.all(workspaceId, limit) : query.all(limit)) as any[];
      return rows.map(r => ({
        id: r.id,
        workspaceId: r.workspace_id,
        network: r.network as NetworkType,
        integrationId: r.integration_id || undefined,
        headers: JSON.parse(r.headers || '{}'),
        queryParams: JSON.parse(r.query_params || '{}'),
        body: JSON.parse(r.body || '{}'),
        rawPayload: r.raw_payload,
        clientIp: r.client_ip,
        verificationStatus: r.verification_status,
        processingStatus: r.processing_status,
        errorMessage: r.error_message || undefined,
        receivedAt: r.received_at,
      }));
    } catch {
      return [];
    }
  }

  public getRawEventById(id: string): RawInboundEvent | undefined {
    try {
      const r = this.db.prepare('SELECT * FROM raw_inbound_events WHERE id = ?').get(id) as any;
      if (!r) return undefined;
      return {
        id: r.id,
        workspaceId: r.workspace_id,
        network: r.network as NetworkType,
        integrationId: r.integration_id || undefined,
        headers: JSON.parse(r.headers || '{}'),
        queryParams: JSON.parse(r.query_params || '{}'),
        body: JSON.parse(r.body || '{}'),
        rawPayload: r.raw_payload,
        clientIp: r.client_ip,
        verificationStatus: r.verification_status,
        processingStatus: r.processing_status,
        errorMessage: r.error_message || undefined,
        receivedAt: r.received_at,
      };
    } catch {
      return undefined;
    }
  }

  // Idempotency DB Records
  public checkIdempotency(idempotencyKey: string): { isDuplicate: boolean; conversionId?: string } {
    try {
      const r = this.db.prepare('SELECT * FROM idempotency_records WHERE idempotency_key = ?').get(idempotencyKey) as any;
      if (r) {
        return { isDuplicate: true, conversionId: r.conversion_id };
      }
      return { isDuplicate: false };
    } catch {
      return { isDuplicate: false };
    }
  }

  public recordIdempotency(key: string, conversionId: string, network: string): void {
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO idempotency_records (idempotency_key, conversion_id, network, created_at)
        VALUES (?, ?, ?, ?)
      `).run(key, conversionId, network, new Date().toISOString());
    } catch (err) {
      console.error('Failed to record idempotency:', err);
    }
  }

  // Canonical Conversions (DB Atomic)
  public saveConversion(c: CanonicalConversion): { success: boolean; isDuplicate?: boolean } {
    try {
      this.db.prepare(`
        INSERT INTO conversions (
          id, workspace_id, raw_event_id, network, integration_id, destination_id,
          transaction_id, parent_transaction_id, order_item_id, event_type,
          tiktok_event_name, value_strategy, currency, commission_amount, gross_amount,
          click_id, status, idempotency_key, error_message, received_at, processed_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          destination_id = excluded.destination_id,
          tiktok_event_name = excluded.tiktok_event_name,
          error_message = excluded.error_message,
          processed_at = excluded.processed_at
      `).run(
        c.id,
        c.workspaceId,
        c.rawEventId,
        c.network,
        c.integrationId || c.networkAccountId || '',
        c.destinationId || c.resolvedPixelId || null,
        c.transactionId,
        c.parentTransactionId || null,
        c.orderItemId || null,
        c.eventType,
        c.tiktokEventName || c.targetEventName || 'CompletePayment',
        c.valueStrategy || 'commission',
        c.currency,
        c.commissionAmount,
        c.grossAmount || null,
        c.clickId || null,
        c.status,
        c.idempotencyKey,
        c.errorMessage || null,
        c.receivedAt,
        c.processedAt || null
      );
      return { success: true };
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint failed: conversions.idempotency_key')) {
        return { success: false, isDuplicate: true };
      }
      throw err;
    }
  }

  public getConversions(workspaceId?: string, limit: number = 500): CanonicalConversion[] {
    try {
      const query = workspaceId
        ? this.db.prepare('SELECT * FROM conversions WHERE workspace_id = ? ORDER BY received_at DESC LIMIT ?')
        : this.db.prepare('SELECT * FROM conversions ORDER BY received_at DESC LIMIT ?');
      const rows = (workspaceId ? query.all(workspaceId, limit) : query.all(limit)) as any[];
      return rows.map(r => this.mapConversion(r));
    } catch {
      return [];
    }
  }

  public getConversionById(id: string): CanonicalConversion | undefined {
    try {
      const r = this.db.prepare('SELECT * FROM conversions WHERE id = ?').get(id) as any;
      if (!r) return undefined;
      return this.mapConversion(r);
    } catch {
      return undefined;
    }
  }

  private mapConversion(r: any): CanonicalConversion {
    return {
      id: r.id,
      workspaceId: r.workspace_id,
      rawEventId: r.raw_event_id,
      network: r.network as NetworkType,
      integrationId: r.integration_id,
      destinationId: r.destination_id || undefined,
      transactionId: r.transaction_id,
      parentTransactionId: r.parent_transaction_id || undefined,
      orderItemId: r.order_item_id || undefined,
      eventType: r.event_type as any,
      tiktokEventName: r.tiktok_event_name,
      valueStrategy: r.value_strategy as any,
      currency: r.currency,
      commissionAmount: r.commission_amount,
      grossAmount: r.gross_amount !== null ? r.gross_amount : undefined,
      clickId: r.click_id || undefined,
      status: r.status as any,
      idempotencyKey: r.idempotency_key,
      errorMessage: r.error_message || undefined,
      receivedAt: r.received_at,
      processedAt: r.processed_at || undefined,
      networkAccountId: r.integration_id,
      targetEventName: r.tiktok_event_name,
      resolvedPixelId: r.destination_id || undefined,
    };
  }

  // Outbox Jobs (Durable Queue)
  public saveOutboxJob(j: OutboxJob): void {
    try {
      this.db.prepare(`
        INSERT INTO outbox_jobs (
          id, workspace_id, conversion_id, destination_id, tiktok_event_name,
          payload, status, attempts, max_attempts, next_retry_at, last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          attempts = excluded.attempts,
          next_retry_at = excluded.next_retry_at,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at
      `).run(
        j.id,
        j.workspaceId,
        j.conversionId,
        j.destinationId,
        j.tiktokEventName,
        JSON.stringify(j.payload || {}),
        j.status,
        j.attempts,
        j.maxAttempts,
        j.nextRetryAt,
        j.lastError || null,
        j.createdAt,
        j.updatedAt
      );
    } catch (err) {
      console.error('Failed to save outbox job:', err);
    }
  }

  public getOutboxJobs(workspaceId?: string): OutboxJob[] {
    try {
      const query = workspaceId
        ? this.db.prepare('SELECT * FROM outbox_jobs WHERE workspace_id = ? ORDER BY created_at DESC')
        : this.db.prepare('SELECT * FROM outbox_jobs ORDER BY created_at DESC');
      const rows = (workspaceId ? query.all(workspaceId) : query.all()) as any[];
      return rows.map(r => this.mapOutbox(r));
    } catch {
      return [];
    }
  }

  public getPendingOutboxJobs(limit: number = 50): OutboxJob[] {
    try {
      const now = new Date().toISOString();
      const rows = this.db.prepare(`
        SELECT * FROM outbox_jobs
        WHERE status IN ('pending', 'failed_retryable')
        AND next_retry_at <= ?
        ORDER BY next_retry_at ASC
        LIMIT ?
      `).all(now, limit) as any[];
      return rows.map(r => this.mapOutbox(r));
    } catch {
      return [];
    }
  }

  private mapOutbox(r: any): OutboxJob {
    return {
      id: r.id,
      workspaceId: r.workspace_id,
      conversionId: r.conversion_id,
      destinationId: r.destination_id,
      tiktokEventName: r.tiktok_event_name,
      payload: JSON.parse(r.payload || '{}'),
      status: r.status as any,
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
      nextRetryAt: r.next_retry_at,
      lastError: r.last_error || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  // Delivery Attempts
  public logDeliveryAttempt(attempt: DeliveryAttempt): void {
    try {
      this.db.prepare(`
        INSERT INTO delivery_attempts (
          id, outbox_job_id, conversion_id, destination_id, pixel_id, event_name,
          status_code, latency_ms, request_payload, response_body, is_success,
          error_classification, error_message, attempted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        attempt.id,
        attempt.outboxJobId,
        attempt.conversionId,
        attempt.destinationId,
        attempt.pixelId,
        attempt.eventName,
        attempt.statusCode,
        attempt.latencyMs,
        JSON.stringify(attempt.requestPayload || {}),
        JSON.stringify(attempt.responseBody || {}),
        attempt.isSuccess ? 1 : 0,
        attempt.errorClassification || null,
        attempt.errorMessage || null,
        attempt.attemptedAt
      );
    } catch (err) {
      console.error('Failed to log delivery attempt:', err);
    }
  }

  public getDeliveryAttemptsForConversion(conversionId: string): DeliveryAttempt[] {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM delivery_attempts WHERE conversion_id = ? ORDER BY attempted_at DESC
      `).all(conversionId) as any[];
      return rows.map(r => ({
        id: r.id,
        outboxJobId: r.outbox_job_id,
        conversionId: r.conversion_id,
        destinationId: r.destination_id,
        pixelId: r.pixel_id,
        eventName: r.event_name,
        statusCode: r.status_code,
        latencyMs: r.latency_ms,
        requestPayload: JSON.parse(r.request_payload || '{}'),
        responseBody: JSON.parse(r.response_body || '{}'),
        isSuccess: r.is_success === 1,
        errorClassification: r.error_classification || undefined,
        errorMessage: r.error_message || undefined,
        attemptedAt: r.attempted_at,
      }));
    } catch {
      return [];
    }
  }

  public getDeliveryAttempts(limit: number = 50): DeliveryAttempt[] {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM delivery_attempts ORDER BY attempted_at DESC LIMIT ?
      `).all(limit) as any[];
      return rows.map(r => ({
        id: r.id,
        outboxJobId: r.outbox_job_id,
        conversionId: r.conversion_id,
        destinationId: r.destination_id,
        pixelId: r.pixel_id,
        eventName: r.event_name,
        statusCode: r.status_code,
        latencyMs: r.latency_ms,
        requestPayload: JSON.parse(r.request_payload || '{}'),
        responseBody: JSON.parse(r.response_body || '{}'),
        isSuccess: r.is_success === 1,
        errorClassification: r.error_classification || undefined,
        errorMessage: r.error_message || undefined,
        attemptedAt: r.attempted_at,
      }));
    } catch {
      return [];
    }
  }

  public clearData(): void {
    try {
      this.db.exec(`
        DELETE FROM conversions;
        DELETE FROM raw_inbound_events;
        DELETE FROM outbox_jobs;
        DELETE FROM delivery_attempts;
        DELETE FROM idempotency_records;
        DELETE FROM tiktok_destinations;
        UPDATE integration_health SET
          total_postbacks_received = 0,
          total_conversions_processed = 0,
          missing_click_id_count = 0,
          duplicate_count = 0,
          failed_deliveries_count = 0,
          attribution_rate = 100,
          delivery_rate = 100,
          last_postback_at = NULL,
          last_conversion_at = NULL,
          last_tiktok_delivery_at = NULL;
      `);
    } catch (err) {
      console.error('Failed to clear data:', err);
    }
  }

  // Integration Health
  public getIntegrationHealth(workspaceId?: string): IntegrationHealth[] {
    try {
      const query = workspaceId
        ? this.db.prepare('SELECT * FROM integration_health WHERE workspace_id = ?')
        : this.db.prepare('SELECT * FROM integration_health');
      const rows = (workspaceId ? query.all(workspaceId) : query.all()) as any[];
      return rows.map(r => ({
        id: r.id,
        workspaceId: r.workspace_id,
        integrationId: r.integration_id,
        network: r.network as NetworkType,
        status: r.status as any,
        lastPostbackAt: r.last_postback_at || undefined,
        lastConversionAt: r.last_conversion_at || undefined,
        lastTikTokDeliveryAt: r.last_tiktok_delivery_at || undefined,
        totalPostbacksReceived: r.total_postbacks_received,
        totalConversionsProcessed: r.total_conversions_processed,
        missingClickIdCount: r.missing_click_id_count,
        duplicateCount: r.duplicate_count,
        failedDeliveriesCount: r.failed_deliveries_count,
        attributionRate: r.attribution_rate,
        deliveryRate: r.delivery_rate,
        updatedAt: r.updated_at,
        networkAccountId: r.integration_id,
      }));
    } catch {
      return [];
    }
  }

  public updateIntegrationHealth(h: IntegrationHealth): void {
    try {
      this.db.prepare(`
        INSERT INTO integration_health (
          id, workspace_id, integration_id, network, status,
          last_postback_at, last_conversion_at, last_tiktok_delivery_at,
          total_postbacks_received, total_conversions_processed, missing_click_id_count,
          duplicate_count, failed_deliveries_count, attribution_rate, delivery_rate, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(integration_id) DO UPDATE SET
          status = excluded.status,
          last_postback_at = excluded.last_postback_at,
          last_conversion_at = excluded.last_conversion_at,
          last_tiktok_delivery_at = excluded.last_tiktok_delivery_at,
          total_postbacks_received = excluded.total_postbacks_received,
          total_conversions_processed = excluded.total_conversions_processed,
          missing_click_id_count = excluded.missing_click_id_count,
          duplicate_count = excluded.duplicate_count,
          failed_deliveries_count = excluded.failed_deliveries_count,
          attribution_rate = excluded.attribution_rate,
          delivery_rate = excluded.delivery_rate,
          updated_at = excluded.updated_at
      `).run(
        h.id,
        h.workspaceId,
        h.integrationId,
        h.network,
        h.status,
        h.lastPostbackAt || null,
        h.lastConversionAt || null,
        h.lastTikTokDeliveryAt || null,
        h.totalPostbacksReceived,
        h.totalConversionsProcessed,
        h.missingClickIdCount,
        h.duplicateCount,
        h.failedDeliveriesCount,
        h.attributionRate,
        h.deliveryRate,
        h.updatedAt
      );
    } catch (err) {
      console.error('Failed to update integration health:', err);
    }
  }

  // Compatibility Wrappers
  public getPixels(workspaceId?: string): TikTokDestination[] {
    return this.getDestinations(workspaceId);
  }

  public getPixelById(id: string, workspaceId?: string): TikTokDestination | undefined {
    return this.getDestinationById(id, workspaceId);
  }

  public savePixel(p: TikTokDestination): void {
    this.saveDestination(p);
  }

  public getNetworkAccounts(workspaceId?: string): AffiliateIntegration[] {
    return this.getIntegrations(workspaceId);
  }

  public getNetworkAccountByToken(network: NetworkType, workspaceId: string, token: string): AffiliateIntegration | undefined {
    return this.getIntegrationByToken(network, token, workspaceId);
  }

  public saveNetworkAccount(n: AffiliateIntegration): void {
    this.saveIntegration(n);
  }

  public saveOutboxTask(t: OutboxJob): void {
    this.saveOutboxJob(t);
  }

  public getOutboxTasks(): OutboxJob[] {
    return this.getOutboxJobs();
  }

  public getAdAccounts(_workspaceId?: string): any[] {
    return [];
  }

  public getOffers(_workspaceId?: string): any[] {
    return [];
  }

  public getTrackingLinks(_workspaceId?: string): any[] {
    return [];
  }
}

export const db = new RelationalDatabaseStore();
