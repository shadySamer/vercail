import { Pool, PoolClient } from 'pg';
import {
  Workspace,
  User,
  Session,
  TikTokDestination,
  AffiliateIntegration,
  RawInboundEvent,
  CanonicalConversion,
  OutboxJob,
  DeliveryAttempt,
  IntegrationHealth,
  NetworkType,
} from '../types';

export class PostgresDatabaseStore {
  private pool: Pool;
  private isInitialized = false;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=disable')
        ? false
        : { rejectUnauthorized: false }, // Supports Vercel Postgres, Neon, Supabase, Railway
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  public async initSchema(): Promise<void> {
    if (this.isInitialized) return;
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(255) NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role VARCHAR(32) NOT NULL DEFAULT 'owner',
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          token VARCHAR(255) NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tiktok_destinations (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          pixel_id VARCHAR(128) NOT NULL,
          access_token_encrypted TEXT NOT NULL,
          default_event_name VARCHAR(64) NOT NULL DEFAULT 'CompletePayment',
          test_event_code VARCHAR(64),
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS affiliate_integrations (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          network VARCHAR(64) NOT NULL,
          name VARCHAR(255) NOT NULL,
          secret_token VARCHAR(255) NOT NULL UNIQUE,
          webhook_secret_encrypted TEXT,
          destination_id VARCHAR(64) REFERENCES tiktok_destinations(id) ON DELETE SET NULL,
          event_name VARCHAR(64),
          value_strategy VARCHAR(32) NOT NULL DEFAULT 'commission',
          status VARCHAR(32) NOT NULL DEFAULT 'connected',
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS raw_inbound_events (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL,
          network VARCHAR(64) NOT NULL,
          integration_id VARCHAR(64),
          headers JSONB NOT NULL DEFAULT '{}'::jsonb,
          query_params JSONB NOT NULL DEFAULT '{}'::jsonb,
          body JSONB NOT NULL DEFAULT '{}'::jsonb,
          raw_payload TEXT NOT NULL,
          client_ip VARCHAR(64) NOT NULL,
          verification_status VARCHAR(32) NOT NULL,
          processing_status VARCHAR(32) NOT NULL,
          error_message TEXT,
          received_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS idempotency_records (
          idempotency_key VARCHAR(128) PRIMARY KEY,
          conversion_id VARCHAR(64) NOT NULL,
          network VARCHAR(64) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conversions (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          raw_event_id VARCHAR(64) NOT NULL,
          network VARCHAR(64) NOT NULL,
          integration_id VARCHAR(64) NOT NULL,
          destination_id VARCHAR(64),
          transaction_id VARCHAR(255) NOT NULL,
          parent_transaction_id VARCHAR(255),
          order_item_id VARCHAR(255),
          event_type VARCHAR(64) NOT NULL,
          tiktok_event_name VARCHAR(64) NOT NULL,
          value_strategy VARCHAR(32) NOT NULL DEFAULT 'commission',
          currency VARCHAR(16),
          commission_amount NUMERIC(14, 4),
          gross_amount NUMERIC(14, 4),
          click_id TEXT,
          status VARCHAR(32) NOT NULL,
          idempotency_key VARCHAR(128) NOT NULL UNIQUE,
          error_message TEXT,
          received_at TIMESTAMPTZ NOT NULL,
          processed_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS outbox_jobs (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          conversion_id VARCHAR(64) NOT NULL REFERENCES conversions(id) ON DELETE CASCADE,
          destination_id VARCHAR(64) NOT NULL,
          tiktok_event_name VARCHAR(64) NOT NULL,
          payload JSONB NOT NULL,
          status VARCHAR(32) NOT NULL,
          attempts INT NOT NULL DEFAULT 0,
          max_attempts INT NOT NULL DEFAULT 5,
          next_retry_at TIMESTAMPTZ NOT NULL,
          claimed_at TIMESTAMPTZ,
          lease_timeout_at TIMESTAMPTZ,
          worker_id VARCHAR(64),
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS delivery_attempts (
          id VARCHAR(64) PRIMARY KEY,
          outbox_job_id VARCHAR(64) NOT NULL REFERENCES outbox_jobs(id) ON DELETE CASCADE,
          conversion_id VARCHAR(64) NOT NULL REFERENCES conversions(id) ON DELETE CASCADE,
          destination_id VARCHAR(64) NOT NULL,
          pixel_id VARCHAR(128) NOT NULL,
          event_name VARCHAR(64) NOT NULL,
          status_code INT NOT NULL,
          latency_ms INT NOT NULL,
          request_payload JSONB NOT NULL,
          response_body JSONB NOT NULL,
          is_success BOOLEAN NOT NULL,
          error_classification VARCHAR(32),
          error_message TEXT,
          attempted_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS integration_health (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          integration_id VARCHAR(64) NOT NULL UNIQUE REFERENCES affiliate_integrations(id) ON DELETE CASCADE,
          network VARCHAR(64) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'healthy',
          last_postback_at TIMESTAMPTZ,
          last_conversion_at TIMESTAMPTZ,
          last_tiktok_delivery_at TIMESTAMPTZ,
          total_postbacks_received INT NOT NULL DEFAULT 0,
          total_conversions_processed INT NOT NULL DEFAULT 0,
          missing_click_id_count INT NOT NULL DEFAULT 0,
          duplicate_count INT NOT NULL DEFAULT 0,
          failed_deliveries_count INT NOT NULL DEFAULT 0,
          attribution_rate NUMERIC(6, 2) NOT NULL DEFAULT 100.00,
          delivery_rate NUMERIC(6, 2) NOT NULL DEFAULT 100.00,
          updated_at TIMESTAMPTZ NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_conversions_workspace ON conversions(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_conversions_transaction ON conversions(integration_id, transaction_id);
        CREATE INDEX IF NOT EXISTS idx_outbox_status_retry ON outbox_jobs(status, next_retry_at);
        CREATE INDEX IF NOT EXISTS idx_raw_events_workspace ON raw_inbound_events(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_delivery_attempts_conversion ON delivery_attempts(conversion_id);
      `);
      this.isInitialized = true;
    } finally {
      client.release();
    }
  }

  public async getClient(): Promise<PoolClient> {
    await this.initSchema();
    return this.pool.connect();
  }

  public async query(text: string, params?: any[]): Promise<any> {
    await this.initSchema();
    return this.pool.query(text, params);
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
