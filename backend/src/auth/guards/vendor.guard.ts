import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class VendorGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;
    const req = context.switchToHttp().getRequest();
    if (req.user?.kind !== 'vendor') {
      throw new ForbiddenException('Vendor access only');
    }
    return true;
  }
}
