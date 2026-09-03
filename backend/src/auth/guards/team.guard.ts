import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Requires a valid JWT AND that its principal is an Auction Team user.
 * Kept distinct from VendorGuard rather than a single "roles" system —
 * spec §3 defines exactly two principal kinds with no sub-roles.
 */
@Injectable()
export class TeamGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;
    const req = context.switchToHttp().getRequest();
    if (req.user?.kind !== 'team') {
      throw new ForbiddenException('Auction Team access only');
    }
    return true;
  }
}
