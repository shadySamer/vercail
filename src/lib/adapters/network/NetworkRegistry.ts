import { AffiliateNetworkAdapter } from './AffiliateNetworkAdapter';
import { MaxWebAdapter } from './MaxWebAdapter';
import { BuyGoodsAdapter } from './BuyGoodsAdapter';
import { Digistore24Adapter } from './Digistore24Adapter';
import { ClickBankAdapter } from './ClickBankAdapter';
import { NetworkType, VerificationCapabilityMatrix } from '../../types';

class NetworkRegistry {
  private adapters: Map<NetworkType, AffiliateNetworkAdapter> = new Map();

  constructor() {
    this.register(new MaxWebAdapter());
    this.register(new BuyGoodsAdapter());
    this.register(new Digistore24Adapter());
    this.register(new ClickBankAdapter());
  }

  public register(adapter: AffiliateNetworkAdapter) {
    this.adapters.set(adapter.network, adapter);
  }

  public getAdapter(network: NetworkType): AffiliateNetworkAdapter | undefined {
    return this.adapters.get(network);
  }

  public getSupportedNetworks(): NetworkType[] {
    return Array.from(this.adapters.keys());
  }

  public getCapabilityMatrix(): VerificationCapabilityMatrix[] {
    return [
      {
        network: 'maxweb',
        directLinking: 'VERIFIED',
        clickIdPersistence: 'VERIFIED',
        s2sPostback: 'VERIFIED',
        purchaseEvent: 'VERIFIED',
        upsellEvent: 'VERIFIED',
        rebillEvent: 'VERIFIED',
        refundEvent: 'VERIFIED',
        chargebackEvent: 'VERIFIED',
        commissionPayout: 'VERIFIED',
        grossRevenue: 'VERIFIED',
        signedSecurity: 'UNSUPPORTED', // Relies on cryptographically random secret endpoint token
        testSimulation: 'VERIFIED',
        notes: 'SubID (1-5) parameters supported. Postback tokens: {SUBID}, {ORDERID}, {COMMISSION_AMOUNT}, {PRODUCT_CODENAME}. Authenticated via secret endpoint URL token.',
      },
      {
        network: 'buygoods',
        directLinking: 'VERIFIED',
        clickIdPersistence: 'VERIFIED',
        s2sPostback: 'VERIFIED',
        purchaseEvent: 'VERIFIED',
        upsellEvent: 'VERIFIED',
        rebillEvent: 'VERIFIED',
        refundEvent: 'VERIFIED',
        chargebackEvent: 'VERIFIED',
        commissionPayout: 'VERIFIED',
        grossRevenue: 'VERIFIED',
        signedSecurity: 'UNSUPPORTED', // Relies on cryptographically random secret endpoint token
        testSimulation: 'VERIFIED',
        notes: 'Dedicated subid tokens {SUBID}, {ORDERID}, {COMMISSION_AMOUNT}, {PRODUCT_CODENAME}. Authenticated via secret endpoint URL token.',
      },
      {
        network: 'digistore24',
        directLinking: 'VERIFIED',
        clickIdPersistence: 'VERIFIED',
        s2sPostback: 'VERIFIED',
        purchaseEvent: 'VERIFIED',
        upsellEvent: 'VERIFIED',
        rebillEvent: 'VERIFIED',
        refundEvent: 'VERIFIED',
        chargebackEvent: 'VERIFIED',
        commissionPayout: 'VERIFIED',
        grossRevenue: 'VERIFIED',
        signedSecurity: 'VERIFIED', // Generic IPN supports SHA-512 passphrase verification
        testSimulation: 'VERIFIED',
        notes: 'Uses cid for TikTok Click ID and custom for labels. Generic IPN supports SHA-512 passphrase signature verification.',
      },
      {
        network: 'clickbank',
        directLinking: 'VERIFIED',
        clickIdPersistence: 'VERIFIED',
        s2sPostback: 'VERIFIED',
        purchaseEvent: 'VERIFIED',
        upsellEvent: 'VERIFIED',
        rebillEvent: 'VERIFIED',
        refundEvent: 'VERIFIED',
        chargebackEvent: 'VERIFIED',
        commissionPayout: 'VERIFIED',
        grossRevenue: 'VERIFIED',
        signedSecurity: 'VERIFIED', // Encrypted INS 6.0/7.0 AES-256-CBC
        testSimulation: 'VERIFIED',
        notes: 'Supports extclid and aff_sub1-5 parameters and encrypted INS 6.0/7.0 AES-256-CBC notifications.',
      },
    ];
  }
}

export const networkRegistry = new NetworkRegistry();
