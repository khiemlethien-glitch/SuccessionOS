import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'talent/:id', renderMode: RenderMode.Server },
  { path: '**',         renderMode: RenderMode.Prerender },
];
