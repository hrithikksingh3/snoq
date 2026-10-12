CREATE TYPE "ListShareMode" AS ENUM ('PUBLIC', 'RESTRICTED');
CREATE TYPE "ListAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

CREATE TABLE "ListShare" (
  "id" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "mode" "ListShareMode" NOT NULL,
  "slug" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ListShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ListAccessRequest" (
  "id" TEXT NOT NULL,
  "shareId" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT NOT NULL,
  "status" "ListAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
  "accessTokenHash" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ListAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListShare_slug_key" ON "ListShare"("slug");
CREATE UNIQUE INDEX "ListShare_listId_mode_key" ON "ListShare"("listId", "mode");
CREATE INDEX "ListShare_listId_idx" ON "ListShare"("listId");
CREATE UNIQUE INDEX "ListAccessRequest_accessTokenHash_key" ON "ListAccessRequest"("accessTokenHash");
CREATE UNIQUE INDEX "ListAccessRequest_shareId_email_key" ON "ListAccessRequest"("shareId", "email");
CREATE INDEX "ListAccessRequest_shareId_status_idx" ON "ListAccessRequest"("shareId", "status");

ALTER TABLE "ListShare" ADD CONSTRAINT "ListShare_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ResourceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListAccessRequest" ADD CONSTRAINT "ListAccessRequest_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "ListShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
