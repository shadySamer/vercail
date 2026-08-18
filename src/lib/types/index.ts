export type CanonicalEventType =
  | 'purchase'
  | 'upsell'
  | 'rebill'
  | 'refund'
  | 'chargeback'
  | 'checkout_started'
  | 'cancelled'
  | 'unknown';

export type ConversionStatus =
  | 'received'
  | 'validated'
  | 'queued'
  | 'sent'
  | 'accepted'
  | 'unattributed'
  | 'duplicate'
  | 'failed_retryable'
  | 'failed_permanent'
  | 'quarantined'
  | 'configuration_error';

export type OutboxStatus =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'failed_retryable'
  | 'failed_permanent';

export type NetworkType = 'maxweb' | 'buygoods' | 'digistore24' | 'clickbank';

export type AdPlatformType = 'tiktok' | 'meta' | 'google';

export type ValueStrategy = 'commission' | 'gross' | 'none';

export type IntegrationHealthStatus = 'healthy' | 'warning' | 'broken' | 'disconnected';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface User {
  id: string;
  workspaceId: string;
  email: string;
  passwordHash: string;
  role: 'owner' | 'member';
  createdAt: string;
}

export interface TikTokDestination {
  id: string;
  workspaceId: string;
  name: string;
  pixelId: string; // TikTok Pixel / Event Source ID
  accessTokenEncrypted: string; // Long-lived Events API Access Token (AES-256-GCM)
  defaultEventName: string; // e.g. CompletePayment, Purchase
  testEventCode?: string; // Optional TikTok Sandbox Test Event Code
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface AffiliateIntegration {
  id: string;
  workspaceId: string;
  network: NetworkType;
  name: string;
  secretToken: string; // Unique token in postback URL
  webhookSecretEncrypted?: string; // Passphrase or secret key for signature check
  destinationId?: string; // Explicitly assigned TikTokDestination ID (No random fallback)
  eventName?: string; // Override event name (if different from destination default)
  valueStrategy: ValueStrategy; // 'commission' | 'gross' | 'none'
  status: 'connected' | 'disconnected' | 'error';
  createdAt: string;
  accountName?: string; // Backward compatibility alias
}

// Backward compatibility alias for Pixel & NetworkAccount during migration
export type Pixel = TikTokDestination;
export type NetworkAccount = AffiliateIntegration;

export interface RawInboundEvent {
  id: string;
  workspaceId: string;
  network: NetworkType;
  integrationId?: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: any;
  rawPayload: string;
  clientIp: string;
  verificationStatus: 'verified' | 'unverified' | 'failed_signature' | 'invalid_token';
  processingStatus: 'processed' | 'duplicate' | 'failed' | 'quarantined';
  errorMessage?: string;
  receivedAt: string;
}

export interface CanonicalConversion {
  id: string;
  workspaceId: string;
  rawEventId: string;
  network: NetworkType;
  integrationId: string;
  destinationId?: string;
  transactionId: string; // Unique network order ID or receipt (Strictly required, NO fake IDs)
  parentTransactionId?: string;
  orderItemId?: string;
  eventType: CanonicalEventType;
  tiktokEventName: string; // Exact event name sent to TikTok
  valueStrategy: ValueStrategy;
  currency: string;
  commissionAmount: number;
  grossAmount?: number;
  clickId?: string; // Cleaned ttclid (without wrapper)
  status: ConversionStatus;
  idempotencyKey: string; // Unique deterministic SHA-256 hash
  errorMessage?: string;
  receivedAt: string;
  processedAt?: string;

  // Backward compatibility optional fields
  networkAccountId?: string;
  targetEventName?: string;
  trafficSource?: string;
  offerName?: string;
  productName?: string;
  campaignId?: string;
  adgroupId?: string;
  adId?: string;
  creativeId?: string;
  resolvedPixelId?: string;
  resolvedAdAccountId?: string;
  customerIp?: string;
  customerUserAgent?: string;
}

export interface OutboxJob {
  id: string;
  workspaceId: string;
  conversionId: string;
  destinationId: string;
  tiktokEventName: string;
  payload: any;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export type OutboxTask = OutboxJob;

export interface DeliveryAttempt {
  id: string;
  outboxJobId: string;
  conversionId: string;
  destinationId: string;
  pixelId: string;
  eventName: string;
  statusCode: number;
  latencyMs: number;
  requestPayload: any;
  responseBody: any;
  isSuccess: boolean;
  errorClassification?: 'RETRYABLE' | 'PERMANENT';
  errorMessage?: string;
  attemptedAt: string;
}

export interface IntegrationHealth {
  id: string;
  workspaceId: string;
  integrationId: string;
  network: NetworkType;
  status: IntegrationHealthStatus;
  lastPostbackAt?: string;
  lastConversionAt?: string;
  lastTikTokDeliveryAt?: string;
  totalPostbacksReceived: number;
  totalConversionsProcessed: number;
  missingClickIdCount: number;
  duplicateCount: number;
  failedDeliveriesCount: number;
  attributionRate: number;
  deliveryRate: number;
  updatedAt: string;

  // Compatibility alias
  networkAccountId?: string;
}

export interface NormalizedNetworkResult {
  isVerified: boolean;
  verificationError?: string;
  transactionId: string;
  parentTransactionId?: string;
  orderItemId?: string;
  eventType: CanonicalEventType;
  currency: string;
  commissionAmount: number;
  grossAmount?: number;
  clickId?: string; // Clean ttclid stripped of wrappers
  productName?: string;
  campaignLabel?: string;
  adgroupLabel?: string;
  adLabel?: string;
  customerIp?: string;
  customerUserAgent?: string;
  customerEmail?: string;
  rawDetails?: Record<string, any>;
}

export interface VerificationCapabilityMatrix {
  network: NetworkType;
  directLinking: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  clickIdPersistence: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  s2sPostback: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  purchaseEvent: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  upsellEvent: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  rebillEvent: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  refundEvent: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  chargebackEvent: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  commissionPayout: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  grossRevenue: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  signedSecurity: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  testSimulation: 'VERIFIED' | 'UNSUPPORTED' | 'UNKNOWN';
  notes: string;
}
