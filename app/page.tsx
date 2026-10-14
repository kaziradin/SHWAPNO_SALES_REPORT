import Dashboard from "@/components/Dashboard";
import data from "@/data/report.json";
import type { Report } from "@/lib/types";

export default function Page() {
  return <Dashboard report={data as unknown as Report} />;
}
