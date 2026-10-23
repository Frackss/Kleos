import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import type { Section } from "@/lib/types";
const sections = [
  "discovery",
  "competitors",
  "recommendations",
  "studio",
  "measurement",
  "settings",
];
export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <Dashboard section={section as Section} />;
}
