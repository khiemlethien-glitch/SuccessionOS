import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../services/api.service';
import { Talent, TalentListResponse } from '../models/talent.model';

@Injectable({ providedIn: 'root' })
export class TalentService {
  constructor(private api: ApiService) {}

  getAll(): Observable<Talent[]> {
    return this.api
      .get<TalentListResponse>('talents', 'talents')
      .pipe(map((res) => res.data));
  }

  getById(id: string): Observable<Talent | undefined> {
    return this.getAll().pipe(
      map((list) => list.find((t) => t.id === id))
    );
  }
}
