import type { ChangeEvent } from "react";

type PaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const start = total ? (current - 1) * pageSize + 1 : 0;
  const end = Math.min(current * pageSize, total);
  const changeSize = (event: ChangeEvent<HTMLSelectElement>) => {
    onPageSizeChange(Number(event.target.value));
    onPageChange(1);
  };

  return <nav className="pagination" aria-label="Paginação da listagem">
    <span className="pagination-total">Exibindo {start}–{end} de {total} registros · Página {current} de {pageCount}</span>
    <div className="pagination-controls">
      <label>Por página<select aria-label="Quantidade de registros por página" value={pageSize} onChange={changeSize}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
      <button type="button" className="secondary" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>Anterior</button>
      <button type="button" className="secondary" disabled={current >= pageCount} onClick={() => onPageChange(current + 1)}>Próxima</button>
    </div>
  </nav>;
}

export const paginate = <T,>(items: T[], page: number, pageSize: number) => {
  const count = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), count);
  return items.slice((current - 1) * pageSize, current * pageSize);
};
