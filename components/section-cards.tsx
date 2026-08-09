import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type Stat = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "overdue" | "pending" | "available";
};

const TONE: Record<NonNullable<Stat["tone"]>, string> = {
  default: "",
  overdue: "text-overdue",
  pending: "text-pending",
  available: "text-available",
};

export function SectionCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader>
            <CardDescription>{stat.label}</CardDescription>
            <CardTitle
              className={`text-3xl font-semibold tabular-nums ${TONE[stat.tone ?? "default"]}`}
            >
              {stat.value}
            </CardTitle>
            {stat.hint ? (
              <p className="text-muted-foreground text-xs">{stat.hint}</p>
            ) : null}
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
