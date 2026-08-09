import { requireLibrarian } from "@/lib/dal";

import { CounterClient } from "./counter-client";

export const metadata = { title: "Counter · Jeppiaar Educity Library" };

export default async function CounterPage() {
  await requireLibrarian();
  return <CounterClient />;
}
