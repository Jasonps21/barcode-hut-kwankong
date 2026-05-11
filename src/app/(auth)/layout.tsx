export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-muted via-background to-muted p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(0.205_0_0/8%),transparent_55%)]" />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
