import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { vi_VN, provideNzI18n } from 'ng-zorro-antd/i18n';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { registerLocaleData } from '@angular/common';
import vi from '@angular/common/locales/vi';

// Icons dùng trong app
import {
  // Layout / Shell
  MenuFoldOutline,
  MenuUnfoldOutline,
  BellOutline,
  // Sidebar navigation
  DashboardOutline,
  TeamOutline,
  ApartmentOutline,
  ClusterOutline,
  SolutionOutline,
  StarOutline,
  UserAddOutline,
  AuditOutline,
  BarChartOutline,
  ShopOutline,
  SettingOutline,
  MoreOutline,
  LogoutOutline,
  // Dashboard KPI
  UserOutline,
  SafetyCertificateOutline,
  WarningOutline,
  ClockCircleOutline,
  ExclamationCircleOutline,
  // Actions / CRUD
  PlusOutline,
  EditOutline,
  DeleteOutline,
  EyeOutline,
  EyeInvisibleOutline,
  SearchOutline,
  UploadOutline,
  ExportOutline,
  LockOutline,
  CloseCircleOutline,
  // Status / misc
  CheckCircleOutline,
  ArrowLeftOutline,
  ArrowRightOutline,
  BulbOutline,
  FilePdfOutline,
  FileExcelOutline,
  // Marketplace
  ApiOutline,
  RobotOutline,
  ReadOutline,
  TrophyOutline,
  // Positions / Modal / Competencies
  ToolOutline,
  CrownOutline,
  MessageOutline,
  SyncOutline,
  AimOutline,
  DollarOutline,
  SafetyOutline,
  RocketOutline,
  UnorderedListOutline,
  BankOutline,
  AlertOutline,
  CheckOutline,
  UserDeleteOutline,
  InboxOutline,
  LineChartOutline,
  SwapOutline,
  CloseOutline,
  FilterOutline,
  RightOutline,
  ArrowUpOutline,
  ArrowDownOutline,
  // Succession / 9-box / Modal
  SlidersOutline,
  ReloadOutline,
  // Admin
  DatabaseOutline,
  FileSearchOutline,
  // Talent
  KeyOutline,
} from '@ant-design/icons-angular/icons';

import { routes } from './app.routes';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';

registerLocaleData(vi);

const icons = [
  // Layout / Shell
  MenuFoldOutline, MenuUnfoldOutline, BellOutline,
  // Sidebar navigation
  DashboardOutline, TeamOutline, ApartmentOutline, ClusterOutline,
  SolutionOutline, StarOutline, UserAddOutline, AuditOutline,
  BarChartOutline, ShopOutline, SettingOutline,
  MoreOutline, LogoutOutline,
  // Dashboard KPI
  UserOutline, SafetyCertificateOutline, WarningOutline, ClockCircleOutline, ExclamationCircleOutline,
  // Actions / CRUD
  PlusOutline, EditOutline, DeleteOutline, EyeOutline,
  EyeInvisibleOutline,
  SearchOutline, UploadOutline, ExportOutline, LockOutline, CloseCircleOutline,
  // Status / misc
  CheckCircleOutline, ArrowLeftOutline, ArrowRightOutline, BulbOutline,
  FilePdfOutline, FileExcelOutline,
  // Marketplace
  ApiOutline, RobotOutline, ReadOutline, TrophyOutline,
  // Positions / Modal / Competencies
  ToolOutline, CrownOutline, MessageOutline, SyncOutline, AimOutline,
  DollarOutline, SafetyOutline, RocketOutline, UnorderedListOutline,
  BankOutline, AlertOutline, CheckOutline, UserDeleteOutline, InboxOutline,
  LineChartOutline, SwapOutline, CloseOutline, FilterOutline, RightOutline,
  ArrowUpOutline, ArrowDownOutline,
  // Succession / 9-box / Modal
  SlidersOutline, ReloadOutline,
  // Admin
  DatabaseOutline, FileSearchOutline,
  // Talent
  KeyOutline,
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch(), withInterceptors([jwtInterceptor])),
    provideAnimations(),
    provideNzI18n(vi_VN),
    provideNzIcons(icons),
  ],
};
