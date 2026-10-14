export type Metrics = {
  sales: number | null; salesLast: number | null;
  ff: number | null; ffLast: number | null;
  bs: number | null; bsLast: number | null;
  gp: number | null; gpLast: number | null;
  gpv: number | null; gpvLast: number | null;
  cpv?: number | null; cpvLast?: number | null;
};

export type DivisionRow = Metrics & { division: string };
export type HeadRow = Metrics & { division: string; role: string; head: string };

export type SegmentKey =
  | "all" | "own" | "franchise" | "same" | "ownSame" | "franchiseSame" | "newOwn" | "newFranchise";

export type Comparison = {
  label: string;
  segments: Partial<Record<SegmentKey, { divisions: DivisionRow[]; total: Metrics | null }>>;
  heads: HeadRow[];
};

export type Outlet = {
  code: string; name: string; leader: string; zonal: string;
  target: number | null; achv: number | null;
  salesTy: number | null; salesLy: number | null;
  salesTm: number | null; salesLm: number | null;
  ff: number | null; ffLy: number | null; ffLm: number | null;
  gp: number | null;
};

export type Cat3Row = {
  division: string; cat1: string; cat3: string; crp: string; head: string;
  sales: number | null; salesLy: number | null;
  sameSales: number | null; sameSalesLy: number | null;
  gp: number | null; gpLy: number | null;
  gpv: number | null; gpvLy: number | null;
};

export type Report = {
  generatedAt: string;
  sourceFile: string;
  asOf: string;
  periodLabel: string;
  target: { target: number | null; achv: number | null };
  sply: Comparison;
  splm: Comparison;
  outlets: Outlet[];
  cat3: Cat3Row[];
};
