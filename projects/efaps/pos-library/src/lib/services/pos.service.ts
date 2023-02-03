import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Decimal } from "decimal.js";
import { BehaviorSubject, Observable } from "rxjs";

import {
  Currency,
  DocItem,
  DocStatus,
  EmployeeRelation,
  EmployeeRelationType,
  Item,
  Order,
  Pos,
  Tax,
  TaxEntry,
  TaxType,
} from "../model";
import { CalculatorService } from "./calculator.service";
import { ConfigService } from "./config.service";
import { DocumentService } from "./document.service";
import { PartListService } from "./part-list.service";
import { TaxService } from "./tax.service";
import { WorkspaceService } from "./workspace.service";

@Injectable({
  providedIn: "root",
  deps: [
    HttpClient,
    ConfigService,
    WorkspaceService,
    DocumentService,
    TaxService,
  ],
})
export class PosService {
  private order: Order = null;
  private orderSource = new BehaviorSubject<Order>(this.order);
  currentOrder = this.orderSource.asObservable();

  private ticket: Item[] = [];
  private ticketSource = new BehaviorSubject<Item[]>(this.ticket);
  currentTicket = this.ticketSource.asObservable();

  private netTotal = 0;
  private netTotalSource = new BehaviorSubject<number>(this.netTotal);
  currentNetTotal = this.netTotalSource.asObservable();

  private taxes: Map<string, number> = new Map();
  private taxesSource = new BehaviorSubject<Map<string, number>>(this.taxes);
  currentTaxes = this.taxesSource.asObservable();

  private crossTotal = 0;
  private crossTotalSource = new BehaviorSubject<number>(this.crossTotal);
  currentCrossTotal = this.crossTotalSource.asObservable();

  private payableAmount = 0;
  private payableAmountSource = new BehaviorSubject<number>(this.payableAmount);
  currentPayableAmount = this.payableAmountSource.asObservable();

  public currency = Currency.USD;
  private currencySource = new BehaviorSubject<Currency>(this.currency);
  currentCurrency = this.currencySource.asObservable();

  public exchangeRate = 1;
  private exchangeRateSource = new BehaviorSubject<number>(this.exchangeRate);
  currentExchangeRate = this.exchangeRateSource.asObservable();

  private _multiplier: number = 1;
  private multiplierSource = new BehaviorSubject<number>(this._multiplier);
  multiplier = this.multiplierSource.asObservable();

  private currentPos: Pos;

  private _contactOid: string | null;

  private employeeRelations: EmployeeRelation[] | undefined;

  constructor(
    private http: HttpClient,
    private config: ConfigService,
    private workspaceService: WorkspaceService,
    private documentService: DocumentService,
    private taxService: TaxService,
    private partListService: PartListService,
    private calculatorService: CalculatorService
  ) {
    this.workspaceService.currentWorkspace.subscribe((data) => {
      if (data) {
        if (!(this.currentPos && this.currentPos.oid === data.posOid)) {
          this.getPos(data.posOid).subscribe((_pos) => {
            this.currentPos = _pos;
            this.currencySource.next(_pos.currency);
          });
          this.changeTicket([]);
        }
      }
    });
    this.currentTicket.subscribe((_ticket) => (this.ticket = _ticket));
    this.currentNetTotal.subscribe((netTotal) => (this.netTotal = netTotal));
    this.currentCrossTotal.subscribe(
      (crossTotal) => (this.crossTotal = crossTotal)
    );
    this.currentPayableAmount.subscribe(
      (payableAmount) => (this.payableAmount = payableAmount)
    );
    this.currentCurrency.subscribe((currency) => (this.currency = currency));
    this.currentExchangeRate.subscribe(
      (exchangeRate) => (this.exchangeRate = exchangeRate)
    );
    this.multiplier.subscribe({
      next: (multiplier) => (this._multiplier = multiplier),
    });
  }

  public getPoss(): Observable<Pos[]> {
    const url = `${this.config.baseUrl}/poss`;
    return this.http.get<Pos[]>(url);
  }

  public getPos(_oid: string): Observable<Pos> {
    const url = `${this.config.baseUrl}/poss/${_oid}`;
    return this.http.get<Pos>(url);
  }

  public setOrder(order: Order) {
    if (order.discount) {
      order.items = order.items.filter(
        (item) => item.product.oid != order.discount.productOid
      );
      order.discount = null;
    }
    this.contactOid = order.contactOid;
    this.orderSource.next(order);
    const items: Item[] = [];
    order.items
      .sort((a, b) => (a.index < b.index ? -1 : 1))
      .forEach((_item) => {
        items.push({
          product: _item.product,
          quantity: _item.quantity,
          price: _item.crossPrice,
          currency: this.currency,
          exchangeRate: this.exchangeRate,
          remark: _item.remark,
        });
      });
    this.changeTicket(items);
  }

  public setMultiplier(multiplier: number) {
    this.multiplierSource.next(multiplier);
  }

  changeTicket(ticket: Item[]) {
    this.partListService.updateTicket(ticket).subscribe({
      next: (ticket) => {
        this.calculateItems(ticket);
        this.calculateTotals(ticket);
        this.ticketSource.next(ticket);
      },
    });
  }

  private calculateItems(ticket: Item[]) {
    ticket.forEach((item: Item) => {
      item.price = this.calculatorService
        .calculateItemCrossPrice(item)
        .toNumber();
    });
  }

  protected calculateTotals(items: Item[]) {
    const totals = this.calculatorService.calculateTotals(items);
    this.netTotalSource.next(totals.netTotal.toNumber());
    this.crossTotalSource.next(totals.crossTotal.toNumber());
    this.payableAmountSource.next(totals.payableAmount.toNumber());

    const taxesNum = new Map<string, number>();
    totals.taxes.forEach((val, key) => {
      taxesNum.set(key, val.toNumber());
    });
    this.taxesSource.next(taxesNum);
  }

  public createOrder(): Observable<Order> {
    return this.documentService.createOrder({
      id: null,
      oid: null,
      number: null,
      currency: this.currency,
      exchangeRate: this.exchangeRate,
      items: this.getDocItems(),
      status: DocStatus.OPEN,
      netTotal: this.netTotal,
      crossTotal: this.crossTotal,
      payableAmount: this.payableAmount,
      taxes: this.getTaxEntries(),
      discount: null,
      payableOid: null,
      contactOid: this.contactOid,
      employeeRelations: this.employeeRelations,
    });
  }

  private getDocItems(): DocItem[] {
    return this.ticket.map(
      (item, index) =>
        <DocItem>{
          index: index + 1,
          product: item.product,
          quantity: item.quantity,
          netUnitPrice: item.product.netPrice,
          netPrice: new Decimal(item.product.netPrice)
            .mul(new Decimal(item.quantity))
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
            .toNumber(),
          crossUnitPrice: item.product.crossPrice,
          crossPrice: item.price,
          remark: item.remark,
          taxes: this.getItemTaxEntries(item),
        }
    );
  }

  private getItemTaxEntries(item: Item): TaxEntry[] {
    const entries: TaxEntry[] = [];
    item.product.taxes.forEach((tax: Tax) => {
      const itemNet = new Decimal(item.product.netPrice).mul(
        new Decimal(item.quantity)
      );
      const taxAmount = this.taxService.calcTax(
        itemNet,
        new Decimal(item.quantity),
        tax
      );
      const base =
        TaxType.PERUNIT === tax.type ? item.quantity : itemNet.toNumber();
      entries.push({
        tax: tax,
        base: base,
        amount: taxAmount.toNumber(),
        currency: item.currency,
        exchangeRate: item.exchangeRate,
      });
    });
    return entries;
  }

  private getTaxEntries(): TaxEntry[] {
    const taxEntries: TaxEntry[] = [];
    const taxValues: Map<string, TaxEntry> = new Map();
    this.getDocItems().forEach((item) => {
      item.taxes.forEach((taxEntry) => {
        if (!taxValues.has(taxEntry.tax.name)) {
          taxValues.set(taxEntry.tax.name, {
            tax: taxEntry.tax,
            base: 0,
            amount: 0,
            currency: item.currency,
            exchangeRate: item.exchangeRate,
          });
        }
        const ce = taxValues.get(taxEntry.tax.name);
        ce.amount = new Decimal(ce.amount)
          .plus(new Decimal(taxEntry.amount))
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toNumber();
        ce.base = new Decimal(ce.base)
          .plus(new Decimal(taxEntry.base))
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toNumber();
        taxValues.set(taxEntry.tax.name, ce);
      });
    });
    taxValues.forEach((_value, _key) => {
      taxEntries.push(_value);
    });
    return taxEntries;
  }

  public updateOrder(_order: Order): Observable<Order> {
    return this.documentService.updateOrder(
      Object.assign(_order, {
        items: this.getDocItems(),
        netTotal: this.netTotal,
        crossTotal: this.crossTotal,
        payableAmount: this.payableAmount,
        taxes: this.getTaxEntries(),
        employeeRelations: this.employeeRelations,
      })
    );
  }

  public calculateOrder(order: Order): Order {
    const docItems = this.ticket.map(
      (item, index) =>
        <DocItem>{
          index: order.items[index].index,
          product: item.product,
          quantity: item.quantity,
          netUnitPrice: item.product.netPrice,
          netPrice: new Decimal(item.product.netPrice)
            .mul(new Decimal(item.quantity))
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
            .toNumber(),
          crossUnitPrice: item.product.crossPrice,
          crossPrice: item.price,
          taxes: this.getItemTaxEntries(item),
        }
    );
    return Object.assign(order, {
      items: docItems,
      netTotal: this.netTotal,
      crossTotal: this.crossTotal,
      payableAmount: this.payableAmount,
      taxes: this.getTaxEntries(),
    });
  }

  public reset() {
    this.changeTicket([]);
    this.orderSource.next(null);
  }

  public set contactOid(contactOid: string | null) {
    this._contactOid = contactOid;
  }

  public get contactOid(): string | null {
    return this._contactOid;
  }

  public addEmployeeRelation(relation: EmployeeRelation) {
    if (this.employeeRelations == null) {
      this.employeeRelations = [];
    }
    this.employeeRelations.push(relation);
  }

  public removeEmployeeRelation(relation: EmployeeRelation) {
    if (this.employeeRelations) {
      const index = this.employeeRelations.findIndex((object) => {
        return (
          object.employeeOid === relation.employeeOid &&
          object.type == relation.type
        );
      });
      if (index !== -1) {
        this.employeeRelations.splice(index, 1);
      }
      if (this.employeeRelations.length == 0) {
        this.employeeRelations = undefined;
      }
    }
  }
  public removeEmployeeRelationsByType(relationType: EmployeeRelationType) {
    if (this.employeeRelations) {
      this.employeeRelations = this.employeeRelations.filter(
        (object) => object.type != relationType
      );
      if (this.employeeRelations.length == 0) {
        this.employeeRelations = undefined;
      }
    }
  }
}
