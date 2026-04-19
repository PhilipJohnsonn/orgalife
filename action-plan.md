# OrgaLife — Plan de Acción

## Contexto

App de productividad personal tipo Kanban. El objetivo es tener una herramienta simple y a medida para organizar tareas, combatir la dispersión y mantener el foco.

**Objetivo:** Uso personal. Si funciona, eventualmente se puede monetizar, pero no es la prioridad.

---

## Stack

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Frontend + Backend | **Next.js 15 (App Router)** | Full-stack en un solo proyecto. API routes eliminan la necesidad de un backend separado en Java. |
| ORM | **Prisma** | Tipado, migraciones automáticas, integración nativa con Next.js. |
| Base de datos | **PostgreSQL** | Robusto, escala bien. Para dev local: Docker o Postgres.app. |
| UI | **Tailwind CSS + shadcn/ui** | Componentes pre-armados de calidad. No reinventar botones y modals. |
| Drag & Drop | **@hello-pangea/dnd** | Fork mantenido de react-beautiful-dnd. |
| Auth | **Ninguna por ahora** | Es uso personal. En v2 se agrega auth simple si se despliega en un VPS. |

### Por qué NO Java para el backend
- Duplica la complejidad de deployment (2 servicios en vez de 1)
- Next.js API routes cubren todo lo que necesita un CRUD con Prisma
- Para una app personal sin lógica de negocio compleja, un backend separado es overhead
- Si el día de mañana se necesita algo más pesado (procesamiento async, jobs), se puede agregar

### Por qué NO LLM local (todavía)
- Correr Llama/Qwen requiere GPU o CPU potente, configurar Ollama o similar, manejar timeouts
- Un API call a Claude o GPT resuelve lo mismo en 3 líneas de código
- Se puede migrar a LLM local en v3 si se quiere, la interfaz es la misma (prompt in, text out)

---

## Fases de desarrollo

### v1 — MVP (1-2 semanas)

**Objetivo:** Un Kanban funcional que se pueda usar todos los días.

#### Funcionalidades
1. **Kanban Board**
   - 3 columnas default: Por hacer, En progreso, Hecho
   - Columnas personalizables (agregar/renombrar/eliminar)
   - Drag & drop de tareas entre columnas
   - Ordenamiento dentro de cada columna

2. **Tareas (CRUD)**
   - Título
   - Descripción (markdown, con preview)
   - Prioridad (alta/media/baja) — color visual
   - Fecha límite (opcional)
   - Etiquetas/tags para categorizar

3. **Vista de detalle de tarea**
   - Click en una tarea abre un modal/panel lateral
   - Editor de descripción markdown
   - Checklist de subtareas (checkbox simple)

#### Estructura del proyecto
```
orgalife/
├── prisma/
│   └── schema.prisma          # Board, Column, Task, Tag, Subtask
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx            # Board principal
│   │   └── api/
│   │       ├── boards/         # CRUD boards
│   │       ├── columns/        # CRUD columnas
│   │       └── tasks/          # CRUD tareas + subtareas
│   ├── components/
│   │   ├── board/
│   │   │   ├── Board.tsx       # Contenedor Kanban
│   │   │   ├── Column.tsx      # Columna individual
│   │   │   └── TaskCard.tsx    # Card de tarea en el board
│   │   ├── task/
│   │   │   ├── TaskDetail.tsx  # Panel/modal de detalle
│   │   │   ├── TaskEditor.tsx  # Editor markdown
│   │   │   └── Subtasks.tsx    # Lista de subtareas
│   │   └── ui/                 # Componentes shadcn/ui
│   └── lib/
│       ├── prisma.ts           # Cliente Prisma singleton
│       └── utils.ts
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

#### Modelo de datos (Prisma)
```prisma
model Board {
  id        String   @id @default(cuid())
  name      String
  columns   Column[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Column {
  id       String @id @default(cuid())
  name     String
  position Int
  boardId  String
  board    Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  tasks    Task[]
}

model Task {
  id          String    @id @default(cuid())
  title       String
  description String?   @db.Text
  priority    String    @default("medium") // low, medium, high
  position    Int
  dueDate     DateTime?
  columnId    String
  column      Column    @relation(fields: [columnId], references: [id], onDelete: Cascade)
  subtasks    Subtask[]
  tags        Tag[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Subtask {
  id        String  @id @default(cuid())
  title     String
  done      Boolean @default(false)
  position  Int
  taskId    String
  task      Task    @relation(fields: [taskId], references: [id], onDelete: Cascade)
}

model Tag {
  id    String @id @default(cuid())
  name  String @unique
  color String @default("#6B7280")
  tasks Task[]
}
```

---

### v2 — Después de usar v1 por 2+ semanas
- Calendario (vista mensual/semanal de tareas con fecha límite)
- AI: botón "Generar plan de acción" en cada tarea (API call a Claude)
- Notas/contexto por proyecto (reemplazo del .md en Apple Notes)
- Adjuntos/archivos por tarea
- Auth simple (un password o login básico)

### v3 — Futuro
- Exportar contexto como .md para sesiones de AI
- API endpoint que exponga el .md (para usar desde Claude Code u otras tools)
- LLM local como opción alternativa
- Múltiples boards/proyectos
- Integración con calendarios externos

---

## Deployment (v1)

Para uso personal, 2 opciones:

1. **Local** (más simple): `npm run dev` y listo. Postgres en Docker.
2. **VPS** (acceso desde cualquier lado): Docker Compose con Next.js + Postgres. Nginx como reverse proxy. Costo: ~$5/mes.

---

## Verificación

1. Crear el proyecto Next.js y verificar que levanta (`npm run dev`)
2. Configurar Prisma, correr migraciones, verificar que la DB se crea correctamente
3. Probar CRUD de tareas via API routes (crear, mover, editar, eliminar)
4. Verificar drag & drop en el board
5. Verificar que el detalle de tarea abre y se puede editar markdown
6. Probar en mobile (responsive)
