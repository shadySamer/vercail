import { AffiliateNetworkAdapter, PostbackContext } from './AffiliateNetworkAdapter';
import { CanonicalEventType, NormalizedNetworkResult } from '../../types';
import { decryptClickBankINS, decryptSecret } from '../../security/crypto';
import { extractCleanTtclid } from '../../security/clickIdHelper';

export class ClickBankAdapter implements AffiliateNetworkAdapter {
  public network = 'clickbank' as const;

  public async verify(context: PostbackContext): Promise<{ isValid: boolean; error?: string }> {
    const secret = context.networkAccount.webhookSecretEncrypted
      ? decryptSecret(context.networkAccount.webhookSecretEncrypted)
      : undefined;

    const body = context.body;
    if (body && typeof body === 'object' && body.notification && body.iv) {
      if (!secret) {
        return { isValid: false, error: 'Missing ClickBank Secret Key to decrypt INS payload' };
      }
      try {
        decryptClickBankINS(secret, body.iv, body.notification);
        return { isValid: true };
      } catch (err: any) {
        return { isValid: false, error: `ClickBank INS Decryption failed: ${err.message}` };
      }
    }

    return { isValid: true };
  }

  public async normalize(context: PostbackContext): Promise<NormalizedNetworkResult> {
    let payload: Record<string, any> = { ...context.query };

    // Check if this is an encrypted INS v6.0/v7.0 POST
    if (context.body && typeof context.body === 'object') {
      if (context.body.notification && context.body.iv) {
        const secret = context.networkAccount.webhookSecretEncrypted
          ? decryptSecret(context.networkAccount.webhookSecretEncrypted)
          : '';
        try {
          const decryptedJson = decryptClickBankINS(secret, context.body.iv, context.body.notification);
          payload = { ...payload, ...JSON.parse(decryptedJson) };
        } catch (err) {
          console.error('Failed to parse decrypted ClickBank INS:', err);
        }
      } else {
        payload = { ...payload, ...context.body };
      }
    }

    // Strict Transaction ID from ClickBank receipt / order_id macro (NO fake fallback)
    const rawTxId = payload.receipt || payload.order_id || payload.transaction_id;
    if (!rawTxId || typeof rawTxId !== 'string' || rawTxId.trim() === '' || rawTxId.includes('{receipt}')) {
      return {
        isVerified: false,
        verificationError: 'Missing mandatory Receipt ID in ClickBank postback payload',
        transactionId: '',
        eventType: 'unknown',
        currency: 'USD',
        commissionAmount: 0,
      };
    }
    const transactionId = rawTxId.trim();

    // Extract Click ID from modern extclid or trackingCodes or aff_sub1-5 or tid
    let rawClickId: string | undefined = payload.extclid || payload.EXTCLID;

    if (!rawClickId && Array.isArray(payload.trackingCodes)) {
      rawClickId = payload.trackingCodes.find((c: string) => c && c.startsWith('ttclid:')) || payload.trackingCodes[0];
    }
    if (!rawClickId) {
      rawClickId = payload.aff_sub1 || payload.aff_sub5 || payload.tid || payload.subid || payload.tracking_code || undefined;
    }

    const clickId = extractCleanTtclid(rawClickId);

    // Financial calculations: ClickBank separates totalAccountAmount (affiliate payout) from totalOrderAmount (gross)
    const commissionRaw = payload.totalAccountAmount || payload.amount || payload.commission || payload.payout || '0';
    const commissionAmount = parseFloat(commissionRaw) || 0;

    const grossRaw = payload.totalOrderAmount || payload.gross_amount || payload.total || undefined;
    const grossAmount = grossRaw ? parseFloat(grossRaw) : undefined;

    const currency = (payload.currency || 'USD').toUpperCase();

    // Transaction Type mapping
    const txType = (payload.transactionType || payload.event || payload.action || 'SALE').toUpperCase();
    let eventType: CanonicalEventType = 'purchase';

    if (txType === 'SALE' || txType === 'TEST_SALE') {
      eventType = 'purchase';
    } else if (txType === 'BILL' || txType === 'TEST_BILL' || txType === 'REBILL') {
      eventType = 'rebill';
    } else if (txType === 'RFND' || txType === 'TEST_RFND' || txType.includes('REFUND')) {
      eventType = 'refund';
    } else if (txType === 'CGBK' || txType === 'TEST_CGBK' || txType.includes('CHARGEBACK')) {
      eventType = 'chargeback';
    } else if (txType === 'CANCEL-REBILL' || txType === 'INS_CHARGEOFF') {
      eventType = 'cancelled';
    } else if (txType.includes('UPSELL')) {
      eventType = 'upsell';
    }

    let productName: string | undefined;
    if (Array.isArray(payload.lineItems) && payload.lineItems.length > 0) {
      const firstItem = payload.lineItems[0];
      productName = firstItem.productTitle || firstItem.itemNo || undefined;
    } else {
      productName = payload.product || payload.product_name || payload.item || undefined;
    }

    const campaignLabel = payload.campaign || payload.tracking_campaign || undefined;

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
      customerIp: payload.customer?.billing?.address?.ip || context.clientIp,
      customerUserAgent: payload.user_agent || context.headers['user-agent'],
      customerEmail: payload.customer?.billing?.email || payload.email || undefined,
      rawDetails: payload,
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
    url.searchParams.set('extclid', clickIdMacro);
    if (metadata.campaign) url.searchParams.set('campaign', metadata.campaign);
    url.searchParams.set('traffic_source', 'tiktok');
    return url.toString();
  }

  public buildPostbackTemplate(workspaceId: string, secretToken: string, host: string): string {
    const cleanHost = host.replace(/\/$/, '');
    return `${cleanHost}/api/v1/postbacks/clickbank/${secretToken}?extclid={extclid}&receipt={receipt}&amount={amount}&transactionType={transactionType}&currency={currency}`;
  }
}
