import { Board } from "./components/board/Board";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-6 py-3">
        <h1 className="text-lg font-bold">OrgaLife</h1>
      </header>
      <Board />
    </div>
  );
}
