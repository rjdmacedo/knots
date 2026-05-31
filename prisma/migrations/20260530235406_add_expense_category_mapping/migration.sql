-- CreateTable
CREATE TABLE "ExpenseCategoryMapping" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseCategoryMapping_groupId_normalizedTitle_idx" ON "ExpenseCategoryMapping"("groupId", "normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategoryMapping_groupId_normalizedTitle_key" ON "ExpenseCategoryMapping"("groupId", "normalizedTitle");

-- AddForeignKey
ALTER TABLE "ExpenseCategoryMapping" ADD CONSTRAINT "ExpenseCategoryMapping_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategoryMapping" ADD CONSTRAINT "ExpenseCategoryMapping_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
