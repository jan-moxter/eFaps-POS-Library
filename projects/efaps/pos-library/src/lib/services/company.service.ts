import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";

import { Company } from "../model";
import { ConfigService } from "./config.service";

@Injectable({
  providedIn: "root",
  deps: [HttpClient, ConfigService]
})
export class CompanyService {
  public currentCompany: Company = null;

  private currentSource = new BehaviorSubject<Company>(this.currentCompany);
  company = this.currentSource.asObservable();

  constructor(private http: HttpClient, private config: ConfigService) {
    if (config.persistence) {
      const persisted: any = config.persistence.currentCompany();
      this.currentCompany = {
        label: persisted.label,
        key: persisted.key
      };
    }
  }

  public getCompanies(): Observable<Company[]> {
    const href = this.config.baseUrl + "/companies";
    const requestUrl = `${href}`;
    return this.http.get<Company[]>(requestUrl);
  }

  setCurrentCompany(company: Company): any {
    this.currentCompany = company;
    this.currentSource.next(company);
  }

  hasCompany(): boolean {
    return this.currentCompany != null;
  }
}
