import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useState } from "react";

type ExportRow = Array<string | number | null | undefined>;
type ListExportProps = { title: string; headers: string[]; rows: ExportRow[]; filename?: string };

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const escapeHtml = (value: unknown) => clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const csvCell = (value: unknown) => `"${clean(value).replace(/"/g, '""')}"`;

export function ListExport({ title, headers, rows, filename = title }: ListExportProps) {
  const [busy, setBusy] = useState(false);
  const base = filename.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "listagem";
  const download = (blob: Blob, extension: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `${base}.${extension}`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportCsv = () => download(new Blob(["\ufeff", headers.map(csvCell).join(";"), "\r\n", rows.map((row) => row.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }), "csv");
  const exportXlsx = async () => {
    setBusy(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet(title.slice(0, 31));
      sheet.addRow(headers); rows.forEach((row) => sheet.addRow(row.map((value) => clean(value))));
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0205D3" } };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
      sheet.columns = headers.map((header, index) => ({ width: Math.min(42, Math.max(14, header.length + 2, ...rows.slice(0, 300).map((row) => clean(row[index]).length + 2))) }));
      const bytes = await workbook.xlsx.writeBuffer(); download(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "xlsx");
    } finally { setBusy(false); }
  };
  const print = () => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.title = `Impressão: ${title}`;
    Object.assign(frame.style, { position: "fixed", left: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden" });
    document.body.appendChild(frame);
    const target = frame.contentWindow;
    if (!target) { frame.remove(); return; }
    const generatedAt = new Date().toLocaleString("pt-BR");
    target.document.open();
    target.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
      @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#17202a;margin:0}h1{font-size:20px;margin:0 0 5px}.meta{color:#667085;margin-bottom:14px}table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e9eef7!important;font-weight:700}tbody tr:nth-child(even){background:#f8fafc!important}.foot{margin-top:10px;color:#667085;font-size:9px}
      </style></head><body><h1>${escapeHtml(title)}</h1><div class="meta">${rows.length} registros · Gerado em ${escapeHtml(generatedAt)}</div><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index])}</td>`).join("")}</tr>`).join("")}</tbody></table><div class="foot">Camarote Shows · ${rows.length} registros</div></body></html>`);
    target.document.close();
    const removeFrame = () => window.setTimeout(() => frame.remove(), 500);
    target.addEventListener("afterprint", removeFrame, { once: true });
    window.setTimeout(() => { target.focus(); target.print(); }, 150);
  };
  return <div className="list-export" aria-label={`Exportar ${title}`}><button type="button" className="secondary" title="Exportar Excel" onClick={() => void exportXlsx()} disabled={busy}><FileSpreadsheet size={15}/><span>{busy ? "Gerando…" : "XLSX"}</span></button><button type="button" className="secondary" title="Exportar CSV" onClick={exportCsv}><FileText size={15}/><span>CSV</span></button><button type="button" className="secondary" title="Salvar como PDF pelo painel de impressão" onClick={print}><Download size={15}/><span>PDF</span></button><button type="button" className="secondary" title="Abrir painel de impressão" onClick={print}><Printer size={15}/><span>Imprimir</span></button></div>;
}
