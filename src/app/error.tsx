"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">Something didn’t load</h1>
      <p className="text-muted-foreground">
        Please try again. Your saved data is safe.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
