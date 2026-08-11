-- DropForeignKey
ALTER TABLE "Posting" DROP CONSTRAINT "Posting_categoryId_fkey";

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
