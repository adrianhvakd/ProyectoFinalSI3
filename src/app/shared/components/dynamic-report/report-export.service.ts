import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import {
  AppliedFilterSummary,
  ComputedSummaryItem,
  DynamicReportConfig,
  ReportColumn,
} from './dynamic-report.models';

@Injectable({
  providedIn: 'root',
})
export class ReportExportService {
  private readonly platformId = inject(PLATFORM_ID);

  formatCell<T>(column: ReportColumn<T>, row: T): string {
    if (column.format) {
      return column.format(row);
    }
    const raw = column.getValue(row);
    if (raw === null || raw === undefined) {
      return '—';
    }
    if (typeof raw === 'boolean') {
      return raw ? 'Sí' : 'No';
    }
    return String(raw);
  }

  async exportXlsx<T>(
    config: DynamicReportConfig<T>,
    columns: readonly ReportColumn<T>[],
    rows: readonly T[],
  ): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const XLSX = await import('xlsx');
    const sheetRows = rows.map((row) => {
      const record: Record<string, string | number> = {};
      for (const col of columns) {
        const raw = col.getValue(row);
        if (typeof raw === 'number' && Number.isFinite(raw) && !col.format) {
          record[col.label] = raw;
        } else {
          record[col.label] = this.formatCell(col, row);
        }
      }
      return record;
    });

    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    worksheet['!cols'] = columns.map((col) => {
      const maxLen = Math.max(
        col.label.length,
        ...rows.slice(0, 200).map((r) => this.formatCell(col, r).length),
      );
      return { wch: Math.min(48, Math.max(12, maxLen + 3)) };
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte');
    XLSX.writeFile(workbook, `${config.filenamePrefix}-${this.fileTimestamp()}.xlsx`);
  }

  exportCsv<T>(
    config: DynamicReportConfig<T>,
    columns: readonly ReportColumn<T>[],
    rows: readonly T[],
  ): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const escapeCsv = (val: string): string => {
      const needsQuote = /[",\r\n;]/.test(val);
      const escaped = val.replace(/"/g, '""');
      return needsQuote ? `"${escaped}"` : escaped;
    };

    const header = columns.map((c) => escapeCsv(c.label)).join(',');
    const body = rows.map((row) =>
      columns.map((col) => escapeCsv(this.formatCell(col, row))).join(','),
    );

    const csvContent = '\uFEFF' + [header, ...body].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.filenamePrefix}-${this.fileTimestamp()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async exportPdf<T>(
    config: DynamicReportConfig<T>,
    columns: readonly ReportColumn<T>[],
    rows: readonly T[],
    appliedFilters: readonly AppliedFilterSummary[],
    summaryItems: readonly ComputedSummaryItem[],
  ): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const orientation = columns.length > 5 ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const emittedAt = this.displayTimestamp();

    // Encabezado institucional
    doc.setFillColor(51, 65, 85);
    doc.rect(0, 0, pageWidth, 22, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('IMPORTADORA INDUSTRIAL B2B', 14, 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(config.title, 14, 16);
    doc.text(`Emitido: ${emittedAt}`, pageWidth - 14, 10, { align: 'right' });
    doc.text(`Registros: ${rows.length}`, pageWidth - 14, 16, { align: 'right' });

    let cursorY = 28;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);

    if (summaryItems.length > 0) {
      const summaryLine = summaryItems.map((s) => `${s.label}: ${s.value}`).join('   |   ');
      doc.setFont('helvetica', 'bold');
      const wrappedSummary = doc.splitTextToSize(summaryLine, pageWidth - 28) as string[];
      doc.text(wrappedSummary, 14, cursorY);
      cursorY += wrappedSummary.length * 4.5 + 2;
    }

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8.5);
    const filterText =
      appliedFilters.length > 0
        ? `Filtros aplicados: ${appliedFilters.map((f) => `${f.label}: ${f.value}`).join(' · ')}`
        : 'Filtros aplicados: Ninguno (todos los registros)';
    const wrappedFilters = doc.splitTextToSize(filterText, pageWidth - 28) as string[];
    doc.text(wrappedFilters, 14, cursorY);
    cursorY += wrappedFilters.length * 4.2 + 3;

    const head = [columns.map((c) => c.label)];
    const body = rows.map((row) => columns.map((col) => this.formatCell(col, row)));

    const columnStyles: Record<number, { halign: 'left' | 'right' | 'center' }> = {};
    columns.forEach((col, idx) => {
      if (col.align) {
        columnStyles[idx] = { halign: col.align };
      }
    });

    autoTable(doc, {
      head,
      body,
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 16 },
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles,
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages();
        const currentPage = doc.getCurrentPageInfo().pageNumber;
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(
          'Importadora Industrial B2B · Documento generado para control administrativo',
          14,
          pageHeight - 8,
        );
        doc.text(`Página ${currentPage} de ${pageCount}`, pageWidth - 14, pageHeight - 8, {
          align: 'right',
        });
      },
    });

    doc.save(`${config.filenamePrefix}-${this.fileTimestamp()}.pdf`);
  }

  private fileTimestamp(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${y}${m}${d}-${hh}${mm}`;
  }

  private displayTimestamp(): string {
    return new Intl.DateTimeFormat('es-BO', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date());
  }
}
