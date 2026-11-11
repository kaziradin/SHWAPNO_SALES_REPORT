export type Metrics = {
  sales: number | null; salesLast: number | null;
  ff: number | null; ffLast: number | null;
  bs: number | null; bsLast: number | null;
  gp: number | null; gpLast: number | null;
  gpv: number | null; gpvLast: number | null;
  cpv?: number | null; cpvLast?: number | null;
  /** GP% and GP value including other income (workbook: "Adjusted GP%", "Adj GPV") */
  gpOi?: number | null; gpOiLast?: number | null;
  gpvOi?: number | null; gpvOiLast?: number | null;
};

export type DivisionRow = Metrics & { division: string };
export type HeadRow = Metrics & { division: string; role: string; head: string };

export type SegmentKey =
  | "all" | "own" | "franchise" | "same" | "ownSame" | "franchiseSame" | "newOwn" | "newFranchise";

export type Comparison = {
  label: string;
  segments: Partial<Record<SegmentKey, { divisions: DivisionRow[]; total: Metrics | null }>>;
  heads: HeadRow[];
  headBlocks?: Partial<Record<SegmentKey, HeadRow[]>>;
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
  gpvOi: number | null; gpvOiLy: number | null;
  sameGpv: number | null; sameGpvLy: number | null;
  sameGpvOi: number | null; sameGpvOiLy: number | null;
};

/** The slice of a monthly snapshot the Overview needs (keeps the page payload small). */
export type MonthOverview = {
  month: string; // YYYY-MM
  asOf: string;
  periodLabel: string;
  generatedAt: string;
  sourceFile: string;
  sply: { label: string; segments: Comparison["segments"] };
  splm: { label: string; segments: Comparison["segments"] };
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

/** Day-wise values from the workbook: one array per field, one value per day of the period. */
export type DayFields = {
  sales: (number | null)[]; splySales: (number | null)[];
  gpv: (number | null)[]; splyGpv: (number | null)[];
  valueAdj: (number | null)[]; splyValueAdj: (number | null)[];
  ff: (number | null)[]; splyFf: (number | null)[];
};

export type DailyHead = DayFields & { division: string; role: string; head: string };

/** One row of the day-wise detail. The rows add up to the total without subtotals: a division row
 *  (no category), a category row (no head), or a CRP row under a head. Footfall is on category rows only, and is
 *  exact there for that person; it is not added up across rows. */
export type DetailRow = Pick<DayFields, "sales" | "splySales" | "gpv" | "splyGpv" | "valueAdj" | "splyValueAdj" | "ff" | "splyFf"> & {
  division: string; category: string | null; head: string | null; crp: string | null;
};

/** A data group on the Day wise sales tab: all stores, same stores, and their own and franchise stores. */
export type StoreKey = "all" | "same" | "allOwn" | "allFran" | "sameOwn" | "sameFran";

/** Footfall (distinct bills) of one person under one head, per day. Exact for that person; bills are counted once
 *  per person, so a person under two heads is not added up across heads. */
export type CrpFf = { division: string; head: string; crp: string; ff: (number | null)[]; splyFf: (number | null)[] };

/** Footfall (distinct bills) of one division, per day. The divisions do not add up: a bill can span divisions. */
export type DivFf = { division: string; ff: (number | null)[]; splyFf: (number | null)[] };

export type DailyDetailData = {
  generatedAt: string;
  sourceFile: string;
  asOf: string;
  /** Rows against the same day last year. */
  groups: Record<StoreKey, DetailRow[]>;
  /** The same rows against the same day last month: the splySales and splyValueAdj fields are last month's. */
  splmGroups: Record<StoreKey, DetailRow[]>;
  /** Footfall of each person under each head: ff is this month, splyFf is the same day last year. */
  crpFfGroups: Record<StoreKey, CrpFf[]>;
  /** The same against the same day last month: splyFf is last month's. */
  splmCrpFfGroups: Record<StoreKey, CrpFf[]>;
  /** Footfall of each division: ff is this month, splyFf is the same day last year. */
  divFfGroups: Record<StoreKey, DivFf[]>;
  /** The same against the same day last month: splyFf is last month's. */
  splmDivFfGroups: Record<StoreKey, DivFf[]>;
};

export type DailyData = {
  generatedAt: string;
  sourceFile: string;
  asOf: string;
  periodLabel: string;
  /** The day of this month, and the same day last year and last month that the workbook compares it with. */
  days: { date: string; sply: string; splm: string }[];
  /** Against the same day last year. */
  groups: Record<StoreKey, { total: DayFields; heads: DailyHead[] }>;
  /** Against the same day last month: the splySales and splyValueAdj fields are last month's. */
  splmGroups: Record<StoreKey, { total: DayFields; heads: DailyHead[] }>;
};
