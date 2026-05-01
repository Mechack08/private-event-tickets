/*
  Warnings:

  - You are about to drop the column `ticketPrice` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `commitment` on the `Ticket` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[claimTxId]` on the table `Ticket` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `claimTxId` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Ticket_commitment_idx";

-- DropIndex
DROP INDEX "Ticket_commitment_key";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "ticketPrice",
ADD COLUMN     "minAge" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "commitment",
ADD COLUMN     "claimTxId" VARCHAR(256) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_claimTxId_key" ON "Ticket"("claimTxId");

-- CreateIndex
CREATE INDEX "Ticket_claimTxId_idx" ON "Ticket"("claimTxId");
