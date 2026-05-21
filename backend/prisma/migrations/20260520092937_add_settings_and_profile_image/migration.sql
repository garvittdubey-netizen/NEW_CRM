-- AlterTable
ALTER TABLE "users" ADD COLUMN     "profileImage" TEXT;

-- CreateTable
CREATE TABLE "tenant_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "autoAssignLeadsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "agentVisibilityMode" TEXT NOT NULL DEFAULT 'OWN_ONLY',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
