import { AffiliateNetworkAdapter, PostbackContext } from './AffiliateNetworkAdapter';
import { CanonicalEventType, NormalizedNetworkResult } from '../../types';
import { decryptSecret, verifyDigistore24Signature } from '../../security/crypto';
import { extractCleanTtclid } from '../../security/clickIdHelper';

export class Digistore24Adapter implements AffiliateNetworkAdapter {
  public network = 'digistore24' as const;

  public async verify(context: PostbackContext): Promise<{ isValid: boolean; error?: string }> {
    const secret = context.networkAccount.webhookSecretEncrypted
      ? decryptSecret(context.networkAccount.webhookSecretEncrypted)
      : undefined;

    if (secret) {
      const params = { ...context.query, ...(typeof context.body === 'object' ? context.body : {}) };
      const signatureHeader = context.headers['x-digistore-signature'] || params.sha_sign;
      const isValid = verifyDigistore24Signature(secret, params, signatureHeader);
      if (!isValid && signatureHeader) {
        return { isValid: false, error: 'Invalid Digistore24 SHA-512 signature' };
      }
    }
    return { isValid: true };
  }

  public async normalize(context: PostbackContext): Promise<NormalizedNetworkResult> {
    const params = { ...context.query, ...(typeof context.body === 'object' ? context.body : {}) };

    // Strict Transaction ID from official Digistore24 transaction_id / order_id (NO fake fallback)
    const rawTxId = params.transaction_id || params.order_id || params.orderid;
    if (!rawTxId || typeof rawTxId !== 'string' || rawTxId.trim() === '' || rawTxId.includes('{transaction_id}')) {
      return {
        isVerified: false,
        verificationError: 'Missing mandatory Transaction ID in Digistore24 postback payload',
        transactionId: '',
        eventType: 'unknown',
        currency: 'USD',
        commissionAmount: 0,
      };
    }
    const transactionId = rawTxId.trim();

    // Extract Click ID from cid / custom
    const rawClickId = params.cid || params.custom || params.CID || params.subid || undefined;
    const clickId = extractCleanTtclid(rawClickId);

    // Commission payout from amount_affiliate (official Affiliate S2S macro)
    const commissionRaw = params.amount_affiliate || params.affiliate_amount || params.payout || params.amount || '0';
    const commissionAmount = parseFloat(commissionRaw) || 0;

    // Gross customer payment from amount_brutto / amount
    const grossRaw = params.amount_brutto || params.gross_amount || params.amount || undefined;
    const grossAmount = grossRaw ? parseFloat(grossRaw) : undefined;

    // Currency
    const currency = (params.currency || 'USD').toUpperCase();

    // Event type mapping from transaction_type and order_type
    const rawEvent = (params.transaction_type || params.event || params.event_label || 'payment').toLowerCase();
    const orderType = (params.order_type || '').toLowerCase();

    let eventType: CanonicalEventType = 'purchase';
    if (rawEvent.includes('refund') || rawEvent === 'on_refund') {
      eventType = 'refund';
    } else if (rawEvent.includes('chargeback') || rawEvent === 'on_chargeback') {
      eventType = 'chargeback';
    } else if (rawEvent.includes('rebill') || rawEvent.includes('recurring') || rawEvent === 'last_paid_day') {
      eventType = 'rebill';
    } else if (orderType.includes('upsell')) {
      eventType = 'upsell';
    }

    const productName = params.product_name || (params.product_id ? `Product #${params.product_id}` : undefined);
    const campaignLabel = params.campaign_key || params.campaign || undefined;

    return {
      isVerified: true,
      transactionId,
      eventType,
      currency,
      commissionAmount,
      grossAmount,
      clickId,
      productName,
      campaignLabel,
      customerIp: params.ip || context.clientIp,
      customerUserAgent: params.user_agent || context.headers['user-agent'],
      customerEmail: params.buyer_email || params.email || undefined,
      rawDetails: params,
    };
  }

  public getSuccessResponse(_context: PostbackContext): { statusCode: number; body: string; contentType: string } {
    return {
      statusCode: 200,
      body: 'OK',
      contentType: 'text/plain',
    };
  }

  public buildDirectLink(baseUrl: string, clickIdMacro: string, metadata: Record<string, string> = {}): string {
    const url = new URL(baseUrl);
    url.searchParams.set('cid', clickIdMacro);
    if (metadata.campaign) url.searchParams.set('custom', metadata.campaign);
    return url.toString();
  }

  public buildPostbackTemplate(workspaceId: string, secretToken: string, host: string): string {
    const cleanHost = host.replace(/\/$/, '');
    return `${cleanHost}/api/v1/postbacks/digistore24/${secretToken}?cid={cid}&transaction_id={transaction_id}&order_type={order_type}&amount_affiliate={amount_affiliate}&amount_brutto={amount_brutto}&currency={currency}&transaction_type={transaction_type}&product_id={product_id}`;
  }
}
