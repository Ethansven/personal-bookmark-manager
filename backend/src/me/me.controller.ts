import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UsersService } from '../users/users.service';

@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  /**
   * Returns the current signed-in person. Lazily provisions the local
   * User row on first call so the rest of the app can rely on a stable
   * `ownerId` for foreign keys.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{
    id: string;
    email: string | null;
    createdAt: Date;
  }> {
    const row = await this.users.ensureExists(user);
    return {
      id: row.id,
      email: row.email,
      createdAt: row.createdAt,
    };
  }
}
