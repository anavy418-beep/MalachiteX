import { Controller, Get } from "@nestjs/common";
import { Public } from "@/common/decorators/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  getHealth() {
    return {
      ok: true,
      service: "api",
      timestamp: new Date().toISOString(),
    };
  }
}
