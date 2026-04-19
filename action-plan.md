# OrgaLife — Plan de Acción

## Contexto

App de productividad personal tipo Kanban. El objetivo es tener una herramienta simple y a medida para organizar tareas, combatir la dispersión y mantener el foco.

**Objetivo:** Uso personal. Si funciona, eventualmente se puede monetizar, pero no es la prioridad.
**Repo:** https://github.com/PhilipJohnsonn/orgalife

---

## Stack

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend + Backend | **Next.js (App Router)** | 16.2.4 |
| ORM | **Prisma** | 7.7.0 |
| Base de datos | **PostgreSQL** | 17 (Docker, puerto 5433) |
| UI | **Tailwind CSS + shadcn/ui** | - |
| Drag & Drop | **@hello-pangea/dnd** | - |
| Íconos | **lucide-react** | - |
| Auth | **Ninguna por ahora** | - |

**Nota Prisma 7:** Requiere `@prisma/adapter-pg` para conectarse. No acepta `new PrismaClient()` vacío como versiones anteriores.

---

## v1 — MVP

### HECHO

- [x] Proyecto Next.js creado
- [x] Docker Compose con PostgreSQL (container `orgalife-db`, puerto 5433)
- [x] Prisma configurado con schema + migración inicial
- [x] Prisma Client singleton con adapter (`app/lib/prisma.ts`)
- [x] Modelo de datos: Board, Column, Task, Subtask, Tag
- [x] API routes completas:
  - `POST/GET /api/boards` — Crear/listar boards
  - `GET/PATCH/DELETE /api/boards/[id]` — CRUD board individual
  - `POST /api/columns` — Crear columna
  - `PATCH/DELETE /api/columns/[id]` — Editar/borrar columna
  - `POST /api/tasks` — Crear tarea
  - `GET/PATCH/DELETE /api/tasks/[id]` — CRUD tarea (incluye tagIds para asignar tags)
  - `POST /api/tasks/[id]/subtasks` — Agregar subtarea
  - `PATCH/DELETE /api/subtasks/[id]` — Editar/borrar subtarea
  - `GET/POST /api/tags` — Listar/crear tags
  - `PATCH/DELETE /api/tags/[id]` — Editar/borrar tags
- [x] shadcn/ui componentes: button, card, dialog, input, textarea, badge, sidebar, calendar, popover, dropdown-menu, separator, tooltip, skeleton, sheet, switch
- [x] Sidebar con navegación (Home, Tasks, Calendar)
- [x] Kanban board: Board.tsx, Column.tsx, TaskCard.tsx
- [x] Drag & drop funcional entre columnas
- [x] Columnas editables (agregar, renombrar, eliminar desde la UI)
- [x] Creación de board automática con columnas default (To Do, In Progress, Done)
- [x] CRUD de tareas (crear, editar, borrar)
- [x] Subtareas (crear, toggle done, borrar)
- [x] Date picker con shadcn (Popover + Calendar, no nativo del browser)
- [x] Fecha límite en creación y edición de tareas
- [x] Tags: crear con color, asignar/desasignar de tareas via TagPicker
- [x] Calendario mensual con vista de tareas por día
- [x] Crear tareas desde el calendario (click en un día → form con fecha pre-cargada)
- [x] Vista Home (dashboard): stats, calendario mini, upcoming, overdue, unscheduled
- [x] Dark mode con toggle en sidebar (persiste en localStorage)
- [x] UI en inglés
- [x] Tipografía Geist configurada correctamente
- [x] Repo GitHub conectado y sincronizado (main + develop)
- [x] `docker/postgres-data` excluido del git
- [x] Dev indicator de Next.js desactivado

### PENDIENTE

- [ ] Descripción con markdown (actualmente es textarea plano, falta renderizado markdown)
- [ ] Reordenamiento de tareas dentro de la misma columna (persistencia correcta de posiciones)
- [ ] Filtrar tareas por tag en el Kanban
- [ ] Diseño responsive (mobile)
- [ ] Vista semanal del calendario
- [ ] Countdown a próximos eventos

---

## v2 — Futuro

- [ ] AI: botón "Generar plan de acción" en cada tarea (API call a Claude)
- [ ] Notas/contexto por proyecto (reemplazo del .md en Apple Notes)
- [ ] Adjuntos/archivos por tarea
- [ ] Auth simple (password o login básico)
- [ ] Exportar contexto como .md para sesiones de AI
- [ ] API endpoint que exponga el .md
- [ ] LLM local como opción alternativa
- [ ] Múltiples boards/proyectos
- [ ] Integración con calendarios externos

---

## Deployment

Para uso personal, 2 opciones:

1. **Local** (más simple): `npm run dev` + Docker con Postgres.
2. **VPS** (acceso desde cualquier lado): Docker Compose con Next.js + Postgres. Nginx como reverse proxy. Costo: ~$5/mes.

---

## Estructura actual del proyecto

```
orgalife/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── app/
│   ├── layout.tsx                          # Root layout (providers, fonts)
│   ├── globals.css
│   ├── (dashboard)/
│   │   ├── layout.tsx                      # Dashboard layout (sidebar)
│   │   ├── page.tsx                        # Home (dashboard)
│   │   ├── tasks/page.tsx                  # Kanban board
│   │   └── calendar/page.tsx               # Monthly calendar
│   ├── lib/
│   │   └── prisma.ts                       # Prisma Client singleton
│   ├── api/
│   │   ├── boards/route.ts
│   │   ├── boards/[id]/route.ts
│   │   ├── columns/route.ts
│   │   ├── columns/[id]/route.ts
│   │   ├── tasks/route.ts
│   │   ├── tasks/[id]/route.ts
│   │   ├── tasks/[id]/subtasks/route.ts
│   │   ├── subtasks/[id]/route.ts
│   │   ├── tags/route.ts
│   │   └── tags/[id]/route.ts
│   ├── components/
│   │   ├── board/
│   │   │   ├── Board.tsx
│   │   │   ├── Column.tsx
│   │   │   └── TaskCard.tsx
│   │   ├── task/
│   │   │   ├── CreateTaskDialog.tsx
│   │   │   ├── TaskDetail.tsx
│   │   │   └── TagPicker.tsx
│   │   ├── calendar/
│   │   │   └── MonthCalendar.tsx
│   │   ├── dashboard/
│   │   │   └── Dashboard.tsx
│   │   ├── AppSidebar.tsx
│   │   ├── DatePicker.tsx
│   │   ├── Providers.tsx
│   │   └── ThemeToggle.tsx
│   └── generated/prisma/                   # Auto-generado, en .gitignore
├── components/ui/                          # shadcn/ui
├── hooks/
│   └── use-mobile.ts
├── docker-compose.yml
├── next.config.ts
├── action-plan.md
└── package.json
```
