import { db } from '../db/store';

export interface NetworkSummary {
  network: string;
  accountName: string;
  totalConversions: number;
  initialSales: number;
  upsells: number;
  refunds: number;
  grossCommission: number;
  refundedCommission: number;
  netCommission: number;
  acceptedByTikTok: number;
  missingClickId: number;
  deliveryRate: number;
}

export interface DashboardSummary {
  totalPostbacks: number;
  totalConversions: number;
  attributedConversions: number;
  unattributedConversions: number;
  acceptedDeliveries: number;
  failedDeliveries: number;
  duplicateCount: number;
  grossCommission: number;
  refundedCommission: number;
  netCommission: number;
  attributionRate: number;
  deliveryRate: number;
  networks: NetworkSummary[];
}

export class AnalyticsEngine {
  /**
   * Aggregate authoritative real-world S2S conversion metrics
   * Zero fake spend, zero fake ROAS - strictly verifiable network data
   */
  public getDashboardMetrics(workspaceId: string): DashboardSummary {
    const conversions = db.getConversions(workspaceId);
    const rawEvents = db.getRawEvents(workspaceId, 1000);
    const healthList = db.getIntegrationHealth(workspaceId);
    const networkAccounts = db.getNetworkAccounts(workspaceId);

    let grossCommission = 0;
    let refundedCommission = 0;
    let totalConversions = 0;
    let attributedConversions = 0;
    let unattributedConversions = 0;
    let acceptedDeliveries = 0;
    let failedDeliveries = 0;

    const netStats: Record<string, {
      accountName: string;
      total: number;
      initialSales: number;
      upsells: number;
      refunds: number;
      grossCommission: number;
      refundedCommission: number;
      acceptedByTikTok: number;
      missingClickId: number;
    }> = {};

    // Initialize map for all configured accounts
    for (const net of networkAccounts) {
      netStats[net.network] = {
        accountName: net.accountName,
        total: 0,
        initialSales: 0,
        upsells: 0,
        refunds: 0,
        grossCommission: 0,
        refundedCommission: 0,
        acceptedByTikTok: 0,
        missingClickId: 0,
      };
    }

    for (const c of conversions) {
      totalConversions++;
      const netKey = c.network || 'unknown';
      if (!netStats[netKey]) {
        netStats[netKey] = {
          accountName: netKey.toUpperCase(),
          total: 0,
          initialSales: 0,
          upsells: 0,
          refunds: 0,
          grossCommission: 0,
          refundedCommission: 0,
          acceptedByTikTok: 0,
          missingClickId: 0,
        };
      }

      netStats[netKey].total += 1;

      if (c.status === 'unattributed') {
        unattributedConversions++;
        netStats[netKey].missingClickId += 1;
      } else {
        attributedConversions++;
      }

      if (c.status === 'accepted') {
        acceptedDeliveries++;
        netStats[netKey].acceptedByTikTok += 1;
      } else if (c.status === 'failed_permanent' || c.status === 'failed_retryable') {
        failedDeliveries++;
      }

      if (c.eventType === 'refund' || c.eventType === 'chargeback') {
        refundedCommission += c.commissionAmount;
        netStats[netKey].refunds += 1;
        netStats[netKey].refundedCommission += c.commissionAmount;
      } else if (c.eventType === 'upsell') {
        grossCommission += c.commissionAmount;
        netStats[netKey].upsells += 1;
        netStats[netKey].grossCommission += c.commissionAmount;
      } else {
        grossCommission += c.commissionAmount;
        netStats[netKey].initialSales += 1;
        netStats[netKey].grossCommission += c.commissionAmount;
      }
    }

    const netCommission = Math.max(0, grossCommission - refundedCommission);
    const totalDuplicates = healthList.reduce((acc, h) => acc + h.duplicateCount, 0);
    const totalPostbacks = rawEvents.length;

    const networks: NetworkSummary[] = Object.keys(netStats).map(key => {
      const s = netStats[key];
      const netComm = Math.max(0, s.grossCommission - s.refundedCommission);
      const deliveryRate = s.total > 0 && (s.total - s.missingClickId) > 0
        ? Math.min(100, Math.round((s.acceptedByTikTok / (s.total - s.missingClickId)) * 100))
        : 100;

      return {
        network: key,
        accountName: s.accountName,
        totalConversions: s.total,
        initialSales: s.initialSales,
        upsells: s.upsells,
        refunds: s.refunds,
        grossCommission: s.grossCommission,
        refundedCommission: s.refundedCommission,
        netCommission: netComm,
        acceptedByTikTok: s.acceptedByTikTok,
        missingClickId: s.missingClickId,
        deliveryRate,
      };
    });

    const attributionRate = totalConversions > 0 ? Math.round((attributedConversions / totalConversions) * 100) : 100;
    const deliveryRate = attributedConversions > 0 ? Math.min(100, Math.round((acceptedDeliveries / attributedConversions) * 100)) : 100;

    return {
      totalPostbacks,
      totalConversions,
      attributedConversions,
      unattributedConversions,
      acceptedDeliveries,
      failedDeliveries,
      duplicateCount: totalDuplicates,
      grossCommission,
      refundedCommission,
      netCommission,
      attributionRate,
      deliveryRate,
      networks,
    };
  }
}

export const analyticsEngine = new AnalyticsEngine();
