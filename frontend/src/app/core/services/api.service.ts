import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = environment.apiUrl;
  private useMock = environment.useMock;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    // SSR-safe: localStorage only exists in the browser. During prerender
    // or server render we just send a token-less request.
    const token = typeof window !== 'undefined'
      ? window.localStorage?.getItem('access_token') ?? null
      : null;
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  /**
   * Load mock JSON từ src/app/mock/
   * Ví dụ: getMock('talents') → /assets/mock/talents.json
   */
  private getMock<T>(mockFile: string): Observable<T> {
    return this.http.get<T>(`/mock/${mockFile}.json`);
  }

  get<T>(endpoint: string, mockFile?: string): Observable<T> {
    if (this.useMock && mockFile) {
      return this.getMock<T>(mockFile);
    }
    return this.http.get<T>(`${this.apiUrl}/${endpoint}`, {
      headers: this.getHeaders(),
    });
  }

  post<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/${endpoint}`, body, {
      headers: this.getHeaders(),
    });
  }

  put<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.apiUrl}/${endpoint}`, body, {
      headers: this.getHeaders(),
    });
  }

  patch<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.apiUrl}/${endpoint}`, body, {
      headers: this.getHeaders(),
    });
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.apiUrl}/${endpoint}`, {
      headers: this.getHeaders(),
    });
  }
}
