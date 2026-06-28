import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { env } from "@/env";
import { verifyInitData } from "@/lib/telegram-init-data";

export async function POST(req: Request) {
  let initData: string | undefined;
  try {
    const body = await req.json();
    initData = typeof body?.initData === "string" ? body.initData : undefined;
  } catch {
    return NextResponse.json({ error: "invalid_init_data" }, { status: 400 });
  }

  if (!initData || !env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "invalid_init_data" }, { status: 400 });
  }

  const tgUser = verifyInitData(initData, env.TELEGRAM_BOT_TOKEN);
  if (!tgUser) {
    return NextResponse.json({ error: "invalid_init_data" }, { status: 400 });
  }

  try {
    const clerk = await clerkClient();
    const telegramId = String(tgUser.id);

    const { data: existingUsers } = await clerk.users.getUserList({
      externalId: [telegramId],
    });

    let userId: string;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
    } else {
      const newUser = await clerk.users.createUser({
        externalId: telegramId,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
      });
      userId = newUser.id;
    }

    const { token } = await clerk.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 300,
    });

    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ error: "auth_failed" }, { status: 500 });
  }
}
