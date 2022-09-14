import { HttpClientTestingModule } from "@angular/common/http/testing";
import { TestBed, inject } from "@angular/core/testing";

import { Observable } from "rxjs";

import { AuthService } from "./auth.service";
import { ConfigService } from "./config.service";
import { MsgService } from "./msg.service";
import { RxStompService } from "./rx-stomp.service";

class ConfigServiceStub {}
class AuthServiceStub {
  currentEvent = new Observable((observer) => {
    observer.next();
  });
}

describe("MsgService", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        MsgService,
        RxStompService,
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: ConfigService, useClass: ConfigServiceStub },
      ],
    });
  });

  it("should be created", inject([MsgService], (service: MsgService) => {
    expect(service).toBeTruthy();
  }));
});
