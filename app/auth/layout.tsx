export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16">
      <span className="text-sm font-medium text-muted-foreground">
        サブスク管理
      </span>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
