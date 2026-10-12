CREATE TABLE "ResourceList" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT 'blue',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResourceListItem" (
  "resourceId" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceListItem_pkey" PRIMARY KEY ("resourceId", "listId")
);

CREATE UNIQUE INDEX "ResourceList_userId_name_key" ON "ResourceList"("userId", "name");
CREATE INDEX "ResourceList_userId_createdAt_idx" ON "ResourceList"("userId", "createdAt");
CREATE INDEX "ResourceListItem_listId_idx" ON "ResourceListItem"("listId");

ALTER TABLE "ResourceList" ADD CONSTRAINT "ResourceList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceListItem" ADD CONSTRAINT "ResourceListItem_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
