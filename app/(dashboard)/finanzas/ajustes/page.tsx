import { AjustesView } from "@/app/components/finance/ajustes/AjustesView";

export default function AjustesPage() {
  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Ajustes</h1>
        <p className="text-sm text-muted-foreground">
          Configuración de una sola vez: cuentas, tarjetas de Wallet, categorías y compromisos.
        </p>
      </div>
      <AjustesView />
    </div>
  );
}
