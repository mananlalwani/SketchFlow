CREATE TABLE "draw_api_counter" (
    "id" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draw_api_counter_pkey" PRIMARY KEY ("id")
);
