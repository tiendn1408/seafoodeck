
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "reviewOfId" TEXT;

-- CreateTable
CREATE TABLE "LearningAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "isReview" BOOLEAN NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "skipped" BOOLEAN NOT NULL,
    "selfRated" BOOLEAN NOT NULL,
    "contentVersion" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewProgress" (
    "userId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "lastSessionId" TEXT NOT NULL,
    "contentVersion" TEXT NOT NULL,
    "selfRated" BOOLEAN NOT NULL,

    CONSTRAINT "ReviewProgress_pkey" PRIMARY KEY ("userId","targetId","skill")
);

-- CreateIndex
CREATE INDEX "LearningAttempt_userId_at_idx" ON "LearningAttempt"("userId", "at");

-- CreateIndex
CREATE INDEX "LearningAttempt_userId_targetId_skill_idx" ON "LearningAttempt"("userId", "targetId", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "LearningAttempt_questionId_targetId_key" ON "LearningAttempt"("questionId", "targetId");

-- CreateIndex
CREATE INDEX "ReviewProgress_userId_dueAt_idx" ON "ReviewProgress"("userId", "dueAt");

-- AddForeignKey
ALTER TABLE "LearningAttempt" ADD CONSTRAINT "LearningAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewProgress" ADD CONSTRAINT "ReviewProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

