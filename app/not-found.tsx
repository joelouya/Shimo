import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/**
 * A link that leads nowhere: a mistyped code, an old poster, a tournament
 * that was removed. Named plainly, with the two doors that always exist.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12 text-center">
      <Logo className="text-[19px]" />
      <p className="smallcaps mt-8 text-muted-foreground">Nothing at this address</p>
      <h1 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
        That page is not here.
      </h1>
      <p className="mt-3 max-w-[340px] text-[15px] leading-relaxed text-ink-soft">
        The link may be old, or the event it pointed at may have been removed.
        Check it with whoever sent it, or start from the app.
      </p>
      <div className="mt-8 flex w-full max-w-[300px] flex-col gap-2">
        <Button variant="clay" size="lg" asChild>
          <Link href="/app">Open Shimo</Link>
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/admin">The club desk</Link>
        </Button>
      </div>
    </main>
  );
}
