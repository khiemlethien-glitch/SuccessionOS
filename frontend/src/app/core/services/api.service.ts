import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

// TODO: ApiService deprecated — chuyển sang SupabaseService + core/services/data/*
// Stub giữ lại để các component cũ còn import được mà build vẫn xanh. Tất cả
// method trả Observable rỗng để không crash runtime.
@Injectable({ providedIn: 'root' })
export class ApiService {
  get<T>(_endpoint: string, _mockFile?: string): Observable<T> {
    return of({ data: [], total: 0 } as unknown as T);
  }
  post<T>(_endpoint: string, _body: unknown): Observable<T> {
    return of({ data: null } as unknown as T);
  }
  put<T>(_endpoint: string, _body: unknown): Observable<T> {
    return of({} as T);
  }
  patch<T>(_endpoint: string, _body: unknown): Observable<T> {
    return of({} as T);
  }
  delete<T>(_endpoint: string): Observable<T> {
    return of({} as T);
  }
}
