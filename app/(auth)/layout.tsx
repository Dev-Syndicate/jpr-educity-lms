import { LibraryBigIcon } from "lucide-react";

/**
 * Two-column auth shell, after shadcn's login-02: form on the left, brand
 * panel on the right. The panel collapses below lg so the form is never
 * squeezed on a phone.
 *
 * Route groups add no URL segment, so this layout sits at "/".
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <span className="flex items-center gap-2 font-medium">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
              <LibraryBigIcon className="size-4" />
            </span>
            Jeppiaar Educity Library
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      <div className="bg-brand-deep relative hidden overflow-hidden lg:block">
        {/* Decorative crest-like mark. Pure CSS, so there is no image to ship
            and it recolours with the theme. */}
        <div
          aria-hidden
          className="bg-gold/10 absolute -top-24 -right-24 size-96 rounded-full blur-3xl"
        />
        <div
          aria-hidden
          className="bg-gold/5 absolute -bottom-32 -left-24 size-96 rounded-full blur-3xl"
        />

        <div className="relative flex h-full flex-col items-center justify-center gap-6 p-12 text-center">
          <LibraryBigIcon className="text-gold size-16" strokeWidth={1.25} />
          <div className="flex flex-col gap-2">
            <p className="text-gold text-xs font-semibold tracking-[0.3em] uppercase">
              Jeppiaar Educity
            </p>
            <h2 className="text-brand-deep-foreground text-4xl font-semibold tracking-tight">
              Library
            </h2>
          </div>
          <p className="text-brand-deep-foreground/70 max-w-xs text-sm">
            Borrow, renew and return at the counter. Check your due dates and
            fines any time.
          </p>
        </div>
      </div>
    </div>
  );
}
