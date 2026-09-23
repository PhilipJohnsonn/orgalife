/** Home-screen mark rendered by next/og; iOS applies its own rounded mask. */
export function AppMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
      }}
    >
      <div
        style={{
          width: size * 0.5,
          height: size * 0.5,
          borderRadius: "50%",
          border: `${Math.round(size * 0.09)}px solid #fafafa`,
        }}
      />
    </div>
  );
}
