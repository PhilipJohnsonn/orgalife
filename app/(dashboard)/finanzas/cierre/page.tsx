import { CierreView } from "@/app/components/finance/cierre/CierreView";

export default function CierrePage() {
  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Cierre de mes</h1>
        <p className="text-sm text-muted-foreground">
          Cierre de mes: saldos, deuda de tarjeta, resúmenes y cotizaciones.
        </p>
      </div>
      <CierreView />
    </div>
  );
}
