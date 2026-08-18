import { AdPlatformType, CanonicalConversion, Pixel, DeliveryAttempt } from '../../types';

export interface DispatchResult {
  isSuccess: boolean;
  statusCode: number;
  responseBody: any;
  latencyMs: number;
  errorClassification?: 'RETRYABLE' | 'PERMANENT';
  errorMessage?: string;
}

export interface AdPlatformAdapter {
  platform: AdPlatformType;

  /**
   * Dispatch a canonical conversion to the destination ad platform API
   */
  dispatchConversion(
    conversion: CanonicalConversion,
    pixel: Pixel,
    accessToken: string,
    options?: { testEventCode?: string; isSimulation?: boolean }
  ): Promise<DispatchResult>;

  /**
   * Classify HTTP status & response codes to determine whether to retry
   */
  classifyError(statusCode: number, responseBody: any): 'RETRYABLE' | 'PERMANENT';
}
