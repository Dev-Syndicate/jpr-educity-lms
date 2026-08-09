// Route groups add no URL segment, so this layout lives at "/".
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-primary text-xs font-semibold tracking-[0.2em] uppercase">
          Jeppiaar Educity
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
      </div>
      {children}
    </div>
  );
}
