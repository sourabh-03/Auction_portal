export type PrincipalKind = 'team' | 'vendor';

export interface TeamUser {
  id: string;
  name: string;
  email: string;
}

export interface VendorUser {
  id: string;
  companyName: string;
  email: string;
  ndaAccepted: boolean;
}

export interface AuthState {
  kind: PrincipalKind;
  token: string;
  team?: TeamUser;
  vendor?: VendorUser;
}

export type AuctionFormat = 'english' | 'japanese';
export type AuctionStatus =
  | 'draft_configuring'
  | 'live'
  | 'closed_pending_review'
  | 'closed_no_bids'
  | 'cancelled'
  | 'sent_to_tc';

export type ThreadStatus =
  | 'referred'
  | 'live'
  | 'closed_pending_review'
  | 'closed_no_bids'
  | 'cancelled'
  | 'sent_to_tc';

export interface PrThread {
  id: string;
  threadCode: string;
  title: string;
  category: string;
  purchaseCode: string;
  department: string;
  costCentre: string;
  tcBuyerName: string;
  qtyDescription: string;
  referralNote?: string | null;
  resultsNeededBy?: string | null;
  status: ThreadStatus;
  createdAt: string;
  auction?: { id: string; format: AuctionFormat; status: AuctionStatus } | null;
}

export interface Vendor {
  id: string;
  companyName: string;
  city?: string | null;
  email: string;
  registeredCategories: string[];
}

export type NotifEventType =
  | 'auction_live'
  | 'auction_cancelled'
  | 'auction_closed_result'
  | 'single_bidder_alert'
  | 'outbid';

export interface AppNotification {
  id: string;
  eventType: NotifEventType;
  payload: { subject?: string; body?: string; title?: string; threadCode?: string };
  sentAt: string;
  readAt: string | null;
}

export interface VendorProfile {
  id: string;
  companyName: string;
  city: string | null;
  email: string;
  phone: string | null;
  registeredCategories: string[];
  ndaAcceptedAt: string | null;
  createdAt: string;
}

export interface VendorActivityHistoryRow {
  auctionId: string;
  threadCode: string;
  title: string;
  format: AuctionFormat;
  status: AuctionStatus;
  rank: number | null;
  finalRate: number | null;
  computedAt: string;
}

export interface VendorActivity {
  invitedCount: number;
  participatedCount: number;
  resultsCount: number;
  wins: number;
  averageRank: number | null;
  history: VendorActivityHistoryRow[];
}

export interface AnalyticsCategoryRow {
  category: string;
  auctionsCount: number;
  totalSavings: number;
  avgSavingsPct: number;
}

export interface AnalyticsOverview {
  totalAuctions: number;
  byStatus: Record<string, number>;
  byFormat: Record<string, number>;
  decidedCount: number;
  totalBaselineValue: number;
  totalAwardedValue: number;
  totalSavings: number;
  savingsPct: number;
  avgBidsPerEnglishAuction: number;
  avgResponsesPerJapaneseAuction: number;
  noBidsCount: number;
  cancelledCount: number;
  singleBidderAlertCount: number;
  byCategory: AnalyticsCategoryRow[];
}

export interface AuctionTemplate {
  auctionId: string;
  threadCode: string;
  title: string;
  format: AuctionFormat;
  createdAt: string;
  english: {
    ceilingPrice: number;
    decrementType: 'absolute' | 'percentage';
    decrementValue: number;
    durationSec: number;
    autoExtend: boolean;
    triggerWindowSec: number | null;
    extensionLengthSec: number | null;
    maxExtensions: number | null;
    visibility: 'full' | 'rank_only';
    reservePrice: number | null;
    tieBreakRule: 'earliest' | 'manual';
  } | null;
  japanese: {
    startingPrice: number;
    floorPrice: number;
    tickDecrement: number;
    tickIntervalSec: number;
    responseWindowSec: number;
    autoDrop: boolean;
    minVendorsRemaining: number;
  } | null;
}

export interface VendorScorecard {
  vendorId: string;
  companyName: string;
  city: string | null;
  invitedCount: number;
  participatedCount: number;
  resultsCount: number;
  wins: number;
  averageRank: number | null;
}
