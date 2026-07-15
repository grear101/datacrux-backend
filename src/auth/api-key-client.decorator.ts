import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Companion to @CurrentUser() for the JWT flow - this one reads what
// ApiKeyGuard attached to the request.
export const ApiKeyClient = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.apiKeyClient;
});
