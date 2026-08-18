import { AdPlatformAdapter, DispatchResult } from './AdPlatformAdapter';
import { CanonicalConversion, TikTokDestination } from '../../types';

export class TikTokAdsAdapter implements AdPlatformAdapter {
  public platform = 'tiktok' as const;
  private apiEndpoint = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

  public classifyError(statusCode: number, responseBody: any): 'RETRYABLE' | 'PERMANENT' {
    if (statusCode === 429 || statusCode >= 500) {
      return 'RETRYABLE';
    }

    const code = responseBody?.code;
    const message = (responseBody?.message || '').toLowerCase();

    if (code === 40001 || message.includes('permission') || message.includes('token') || statusCode === 401) {
      return 'PERMANENT';
    }
    if (code === 40002 || message.includes('pixel') || message.includes('parameter') || statusCode === 400) {
      return 'PERMANENT';
    }

    return 'RETRYABLE';
  }

  public async dispatchConversion(
    conversion: CanonicalConversion,
    destination: TikTokDestination,
    accessToken: string,
    options: { testEventCode?: string; isSimulation?: boolean } = {}
  ): Promise<DispatchResult> {
    const startTime = Date.now();

    // Deduplication Key: Use deterministic conversion.id to ensure stable event_id across all retries
    const eventId = conversion.id;

    // Unix timestamp in seconds
    const eventTime = Math.floor(new Date(conversion.receivedAt || Date.now()).getTime() / 1000);

    // Event name: Exact source of truth
    const eventName = conversion.tiktokEventName || destination.defaultEventName || 'CompletePayment';

    // User matching object
    const userPayload: Record<string, any> = {};
    if (conversion.clickId) {
      userPayload.ttclid = conversion.clickId;
    }

    // Determine event value strictly based on selected Value Strategy (NO IMPLICIT FALLBACK, NO FAKE DEFAULTS)
    const properties: Record<string, any> = {};
    const strategy = conversion.valueStrategy || 'commission';

    if (strategy === 'commission') {
      if (conversion.commissionAmount !== null && conversion.commissionAmount !== undefined) {
        properties.value = Number(conversion.commissionAmount.toFixed(2));
        if (conversion.currency) {
          properties.currency = conversion.currency;
        }
      }
    } else if (strategy === 'gross') {
      if (conversion.grossAmount !== undefined && conversion.grossAmount !== null) {
        properties.value = Number(conversion.grossAmount.toFixed(2));
        if (conversion.currency) {
          properties.currency = conversion.currency;
        }
      }
    }
    // If strategy === 'none', omit value completely

    // Standardized TikTok Events API v1.3 payload
    const payload: Record<string, any> = {
      event_source: 'web',
      event_source_id: destination.pixelId,
      data: [
        {
          event: eventName,
          event_time: eventTime,
          event_id: eventId,
          user: userPayload,
          properties,
        },
      ],
    };

    // Test Event Code for Sandbox validation
    const testCode = options.testEventCode || destination.testEventCode;
    if (testCode) {
      payload.test_event_code = testCode;
    }

    // In explicit simulation test mode
    if (options.isSimulation) {
      const latencyMs = Math.max(15, Date.now() - startTime + Math.floor(Math.random() * 50 + 25));
      return {
        isSuccess: true,
        statusCode: 200,
        responseBody: {
          code: 0,
          message: 'OK',
          data: {
            pixel_id: destination.pixelId,
            event: eventName,
            event_id: eventId,
            events_processed: 1,
            value_strategy: strategy,
            value_sent: properties.value,
            test_mode: true,
          },
          log_id: `sim_tt_log_${Date.now()}`,
        },
        latencyMs,
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      const responseBody = await response.json().catch(() => ({}));

      const isSuccess = response.ok && (responseBody?.code === 0 || responseBody?.code === 20000);
      const errorClassification = isSuccess ? undefined : this.classifyError(response.status, responseBody);

      return {
        isSuccess,
        statusCode: response.status,
        responseBody,
        latencyMs,
        errorClassification,
        errorMessage: isSuccess ? undefined : (responseBody?.message || `HTTP ${response.status} Error`),
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        isSuccess: false,
        statusCode: 0,
        responseBody: { error: err.message },
        latencyMs,
        errorClassification: 'RETRYABLE',
        errorMessage: err.name === 'AbortError' ? 'TikTok Events API Request Timeout (10s)' : err.message,
      };
    }
  }
}

export const tikTokAdsAdapter = new TikTokAdsAdapter();
