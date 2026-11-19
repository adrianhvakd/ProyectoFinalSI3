export interface ReportColumn<T> {
  key: string;
  label: string;
  defaultVisible?: boolean;
  align?: 'left' | 'right' | 'center';
  getValue: (row: T) => string | number | boolean | null | undefined;
  format?: (row: T) => string;
}

export interface ReportFilterOption {
  label: string;
  value: string;
}

export type ReportFilterDef<T> =
  | {
      key: string;
      label: string;
      type: 'select';
      options: readonly ReportFilterOption[];
      accessor: (row: T) => string | null | undefined;
    }
  | {
      key: string;
      label: string;
      type: 'boolean';
      trueLabel?: string;
      falseLabel?: string;
      accessor: (row: T) => boolean | null | undefined;
    }
  | {
      key: string;
      label: string;
      type: 'date-range';
      accessor: (row: T) => string | null | undefined;
    };

export interface ReportSummaryCard<T> {
  label: string;
  compute: (rows: readonly T[]) => string;
}

export interface DynamicReportConfig<T> {
  title: string;
  subtitle: string;
  filenamePrefix: string;
  columns: readonly ReportColumn<T>[];
  filters: readonly ReportFilterDef<T>[];
  searchFields: readonly ((row: T) => string | null | undefined)[];
  summaryCards?: readonly ReportSummaryCard<T>[];
}

export interface AppliedFilterSummary {
  label: string;
  value: string;
}

export interface ComputedSummaryItem {
  label: string;
  value: string;
}
