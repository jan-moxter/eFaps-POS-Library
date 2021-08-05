import { Injectable } from "@angular/core";
import { ProductService } from "./product.service";
import { Product, ProductType, Item, ProductRelationType } from "../model";
import { BehaviorSubject } from "rxjs";

@Injectable({
  providedIn: "root",
  deps: [ProductService]
})
export class PartListService {
  private partLists: Product[];
  private partListComb = [];
  private partListSource = new BehaviorSubject<Product>(null);
  detectedPartList = this.partListSource.asObservable();

  constructor(private productService: ProductService) {
    this.loadPartLists();
  }

  public loadPartLists() {
    this.productService.getProductsByType(ProductType.PARTLIST).subscribe({
      next: products => {
        this.partLists = products;
      }
    });
  }

  public updateTicket(ticket: Item[]): Item[] {
    if (this.partLists == undefined) {
      this.loadPartLists();
    }
    if (this.partLists.length > 0) {
      const ticketComb = this.getTicketComb(ticket);
      const plComb = this.getPartListCombinations();

      const plHit = plComb.find(pl => {
        return pl.combinations.every(elem => ticketComb.includes(elem));
      });
      if (plHit) {
        const newTicket = [];
        plHit.partList.relations.forEach(relation => {
          if (ProductRelationType.SALESBOM == relation.type) {
            let currentQuantity: number = relation.quantity;
            ticket.forEach(item => {
              if (item.product.oid == relation.productOid) {
                if (currentQuantity => item.quantity) {
                  currentQuantity = currentQuantity - item.quantity;
                } else {
                  item.quantity = item.quantity - currentQuantity;
                  currentQuantity = 0;
                  newTicket.push(item);
                }
              } else {
                newTicket.push(item);
              }
            });
            ticket = newTicket;
          }
        });
        ticket.push({
          product: plHit.partList,
          quantity: 1,
          price: plHit.partListcrossPrice,
          remark: ""
        });
        this.partListSource.next(plHit.partList);
      }
    }
    return ticket;
  }

  public getTicketComb(ticket: Item[]): string[] {
    const ticketMap = new Map<string, number>();
    ticket.forEach(item => {
      let quantity = 0;
      if (ticketMap.has(item.product.oid)) {
        quantity = quantity + ticketMap.get(item.product.oid);
      }
      quantity = quantity + item.quantity;
      ticketMap.set(item.product.oid, quantity);
    });
    const ticketComp = [];
    ticketMap.forEach((value, key) => {
      ticketComp.push(value + "-" + key);
    });
    return ticketComp;
  }

  public getPartListCombinations() {
    if (this.partLists.length > 0 && this.partListComb.length == 0) {
      this.partLists.forEach(partList => {
        const comp = [];
        partList.relations.forEach(relation => {
          if (ProductRelationType.SALESBOM == relation.type) {
            comp.push(relation.quantity + "-" + relation.productOid);
          }
        });
        this.partListComb.push({
          partList,
          combinations: comp
        });
      });
    }
    return this.partListComb;
  }
}
