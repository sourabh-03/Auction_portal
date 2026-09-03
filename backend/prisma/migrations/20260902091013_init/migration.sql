-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('referred', 'live', 'closed_pending_review', 'closed_no_bids', 'cancelled', 'sent_to_tc');

-- CreateEnum
CREATE TYPE "AuctionFormat" AS ENUM ('english', 'japanese');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('draft_configuring', 'live', 'closed_pending_review', 'closed_no_bids', 'cancelled', 'sent_to_tc');

-- CreateEnum
CREATE TYPE "DecrementType" AS ENUM ('absolute', 'percentage');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('full', 'rank_only');

-- CreateEnum
CREATE TYPE "TieBreakRule" AS ENUM ('earliest', 'manual');

-- CreateEnum
CREATE TYPE "AuctionPhase" AS ENUM ('awaiting_response', 'transition');

-- CreateEnum
CREATE TYPE "BidLogType" AS ENUM ('bid', 'stay', 'drop', 'system', 'cancelled');

-- CreateEnum
CREATE TYPE "NotifRecipientType" AS ENUM ('vendor', 'auction_team');

-- CreateEnum
CREATE TYPE "NotifChannel" AS ENUM ('sms', 'email', 'portal');

-- CreateEnum
CREATE TYPE "NotifEvent" AS ENUM ('auction_live', 'auction_cancelled', 'auction_closed_result', 'single_bidder_alert');

-- CreateTable
CREATE TABLE "AuctionTeamUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionTeamUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "city" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "registeredCategories" TEXT[],
    "ndaAcceptedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrThread" (
    "id" TEXT NOT NULL,
    "threadCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "purchaseCode" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "costCentre" TEXT NOT NULL,
    "tcBuyerName" TEXT NOT NULL,
    "qtyDescription" TEXT NOT NULL,
    "referralNote" TEXT,
    "resultsNeededBy" TIMESTAMP(3),
    "status" "ThreadStatus" NOT NULL DEFAULT 'referred',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "prThreadId" TEXT NOT NULL,
    "format" "AuctionFormat" NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'draft_configuring',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "sentToTcAt" TIMESTAMP(3),
    "sentToTcById" TEXT,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionConfigEnglish" (
    "auctionId" TEXT NOT NULL,
    "ceilingPrice" DECIMAL(65,30) NOT NULL,
    "decrementType" "DecrementType" NOT NULL,
    "decrementValue" DECIMAL(65,30) NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "autoExtend" BOOLEAN NOT NULL,
    "triggerWindowSec" INTEGER,
    "extensionLengthSec" INTEGER,
    "maxExtensions" INTEGER,
    "visibility" "Visibility" NOT NULL,
    "reservePrice" DECIMAL(65,30),
    "tieBreakRule" "TieBreakRule" NOT NULL,
    "currentEndsAt" TIMESTAMP(3),
    "extensionsUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AuctionConfigEnglish_pkey" PRIMARY KEY ("auctionId")
);

-- CreateTable
CREATE TABLE "AuctionConfigJapanese" (
    "auctionId" TEXT NOT NULL,
    "startingPrice" DECIMAL(65,30) NOT NULL,
    "floorPrice" DECIMAL(65,30) NOT NULL,
    "tickDecrement" DECIMAL(65,30) NOT NULL,
    "tickIntervalSec" INTEGER NOT NULL,
    "responseWindowSec" INTEGER NOT NULL,
    "autoDrop" BOOLEAN NOT NULL,
    "minVendorsRemaining" INTEGER NOT NULL,
    "currentCallPrice" DECIMAL(65,30),
    "currentPhase" "AuctionPhase",
    "currentWindowEndsAt" TIMESTAMP(3),
    "tickToken" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AuctionConfigJapanese_pkey" PRIMARY KEY ("auctionId")
);

-- CreateTable
CREATE TABLE "AuctionInvitee" (
    "auctionId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AuctionInvitee_pkey" PRIMARY KEY ("auctionId","vendorId")
);

-- CreateTable
CREATE TABLE "AuctionSeat" (
    "auctionId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastBidPrice" DECIMAL(65,30),
    "dropPrice" DECIMAL(65,30),
    "respondedThisWindow" BOOLEAN NOT NULL DEFAULT false,
    "joinedByUserId" TEXT,
    "disconnectedAt" TIMESTAMP(3),

    CONSTRAINT "AuctionSeat_pkey" PRIMARY KEY ("auctionId","vendorId")
);

-- CreateTable
CREATE TABLE "BidLogEntry" (
    "id" BIGSERIAL NOT NULL,
    "auctionId" TEXT NOT NULL,
    "vendorId" TEXT,
    "actedByUserId" TEXT,
    "type" "BidLogType" NOT NULL,
    "price" DECIMAL(65,30),
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidAttemptRejected" (
    "id" BIGSERIAL NOT NULL,
    "auctionId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "attemptedPrice" DECIMAL(65,30) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidAttemptRejected_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionResult" (
    "auctionId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "rank" INTEGER,
    "finalRate" DECIMAL(65,30),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionResult_pkey" PRIMARY KEY ("auctionId","vendorId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientType" "NotifRecipientType" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" "NotifChannel" NOT NULL,
    "eventType" "NotifEvent" NOT NULL,
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuctionTeamUser_email_key" ON "AuctionTeamUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_email_key" ON "Vendor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PrThread_threadCode_key" ON "PrThread"("threadCode");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_prThreadId_key" ON "Auction"("prThreadId");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_prThreadId_fkey" FOREIGN KEY ("prThreadId") REFERENCES "PrThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionConfigEnglish" ADD CONSTRAINT "AuctionConfigEnglish_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionConfigJapanese" ADD CONSTRAINT "AuctionConfigJapanese_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionInvitee" ADD CONSTRAINT "AuctionInvitee_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionSeat" ADD CONSTRAINT "AuctionSeat_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidLogEntry" ADD CONSTRAINT "BidLogEntry_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionResult" ADD CONSTRAINT "AuctionResult_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
