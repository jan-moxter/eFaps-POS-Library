import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';

import { WorkspaceService } from '../services';

@Injectable()
export class WorkspaceGuard implements CanActivate {

 constructor(private router: Router, private workspaceService: WorkspaceService) { }

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {
    return new Promise<boolean> (resolve => {
         this.workspaceService.hasCurrent().then(_ret => {
             if (_ret) {
                 resolve(true);
              } else {
                  this.router.navigate(['/workspaces']);
                  resolve(false);
              }
          });
      });
  }
}