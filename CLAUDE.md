# CLAUDE.md — SuccessionOS Frontend

> Chúng ta build Angular 18 frontend.
> Dev team build .NET 8 backend theo API_CONTRACTS.md.
> Trong lúc chờ API: dùng mock data trong src/mock/

## Tech Stack
- Angular 18 + TypeScript
- ng-zorro-antd (Ant Design) — UI chính
- Kendo UI for Angular — grid, charts
- HttpClient với interceptor tự attach JWT

## Folder structure
src/app/
├── core/           Auth service, guards, HTTP interceptor
├── shared/         Components/pipes dùng chung
├── mock/           JSON files mock data (tạm thời)
└── modules/        Lazy loaded: talent, succession, idp...

## Base API URL
- Development: http://localhost:5000/api/v1
- Staging:     https://api.successionos.vn/api/v1
- Cấu hình trong: src/environments/environment.ts

## Mock → Real API
Mỗi service có 1 flag:
  useMock = true  → đọc từ src/mock/*.json
  useMock = false → gọi real API endpoint

## Không build backend
Dev team tự build .NET 8 theo API_CONTRACTS.md