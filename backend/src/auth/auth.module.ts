import { Module, OnModuleInit } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './auth.config';
import { AuthService } from './auth.service';
import { AuthController, CallbackController } from './auth.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    UsersModule,
  ],
  providers: [JwtStrategy, AuthService],
  controllers: [AuthController, CallbackController],
  exports: [PassportModule, AuthService],
})
export class AuthModule implements OnModuleInit {
  constructor(private readonly auth: AuthService) {}
  async onModuleInit(): Promise<void> {
    // Pre-warm the JWKS cache so the first /callback doesn't pay the
    // round-trip latency. Failures here are non-fatal — token exchange
    // will surface them as 401s on use.
    try {
      await this.auth.initJwks();
    } catch {
      // logged inside initJwks via the service
    }
  }
}