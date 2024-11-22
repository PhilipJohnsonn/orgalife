import KanbanBoard from './components/KanbanBoard'

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold mb-8">Welcome to Your Life Organizer</h1>
      <KanbanBoard />
    </main>
  )
}