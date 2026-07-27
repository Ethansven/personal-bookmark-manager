import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, User } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Owns the User row lifecycle.
 *
 * Strategy: lazy upsert. Every authenticated request goes through
 * `ensureExists`, which returns the local DB row. This keeps the
 * frontend completely stateless (no signup flow) and means the privacy
 * invariant ("user A can never learn of user B") holds by construction
 * — we only ever look up or create by the token's `sub`.
 *
 * The first time a brand-new `sub` arrives, we create the row with the
 * email claim (if any). Subsequent requests are a single read.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async ensureExists(tokenUser: AuthenticatedUser): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { id: tokenUser.sub },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.user.create({
      data: {
        id: tokenUser.sub,
        email: tokenUser.email ?? null,
      },
    });
  }

  async findById(sub: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: sub } });
  }
}
