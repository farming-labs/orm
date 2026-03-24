import type { OrmClient } from "@farming-labs/orm";
import { authSchema } from "./schema";

export type AuthOrm = OrmClient<typeof authSchema>;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function createAuthStore(db: AuthOrm) {
  return {
    findUserByEmail(email: string) {
      return db.user.findUnique({
        where: {
          email: normalizeEmail(email),
        },
        select: {
          id: true,
          name: true,
          email: true,
          profile: {
            select: {
              bio: true,
            },
          },
          accounts: {
            select: {
              provider: true,
              accountId: true,
            },
          },
          sessions: {
            select: {
              token: true,
              expiresAt: true,
            },
            orderBy: {
              expiresAt: "desc",
            },
          },
        },
      });
    },
    async createOAuthUser(input: {
      name: string;
      email: string;
      provider: string;
      accountId: string;
    }) {
      return db.transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: input.name,
            email: normalizeEmail(input.email),
          },
          select: {
            id: true,
            email: true,
          },
        });

        const account = await tx.account.create({
          data: {
            userId: user.id,
            provider: input.provider,
            accountId: input.accountId,
          },
          select: {
            provider: true,
            accountId: true,
          },
        });

        return { user, account };
      });
    },
    rotateSession(input: { userId: string; token: string; expiresAt: Date }) {
      return db.session.upsert({
        where: {
          token: input.token,
        },
        create: {
          userId: input.userId,
          token: input.token,
          expiresAt: input.expiresAt,
        },
        update: {
          expiresAt: input.expiresAt,
        },
        select: {
          token: true,
          expiresAt: true,
        },
      });
    },
    invalidateUserSessions(userId: string) {
      return db.session.deleteMany({
        where: {
          userId,
        },
      });
    },
    getAuthSummary(userId: string) {
      return db.batch([
        (tx) =>
          tx.user.findUnique({
            where: {
              id: userId,
            },
            select: {
              id: true,
              email: true,
            },
          }),
        (tx) =>
          tx.session.count({
            where: {
              userId,
            },
          }),
        (tx) =>
          tx.account.count({
            where: {
              userId,
            },
          }),
      ] as const);
    },
  };
}
