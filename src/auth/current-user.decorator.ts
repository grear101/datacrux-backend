import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Lets controllers write @CurrentUser() instead of digging into the raw
// request object every time - keeps the "clientId comes from the verified
// token" rule in one obvious place.
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user; // set by JwtStrategy.validate()
});
