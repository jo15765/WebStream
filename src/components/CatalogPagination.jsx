import ReactPaginate from "react-paginate";

export function CatalogPagination({ pageCount, pageIndex, pageSize, total, onPageChange }) {
  if (pageCount <= 1) return null;

  const from = pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <nav className="catalog-pagination" aria-label="Catalog pages">
      <p className="catalog-pagination-meta">
        Showing <strong>{from}</strong>–<strong>{to}</strong> of <strong>{total}</strong>
      </p>
      <ReactPaginate
        breakLabel="…"
        nextLabel="Next"
        previousLabel="Previous"
        pageCount={pageCount}
        forcePage={pageIndex}
        onPageChange={({ selected }) => onPageChange(selected)}
        pageRangeDisplayed={4}
        marginPagesDisplayed={1}
        renderOnZeroPageCount={null}
        containerClassName="catalog-pagination-list"
        pageClassName="catalog-pagination-item"
        pageLinkClassName="catalog-pagination-link"
        previousClassName="catalog-pagination-item catalog-pagination-nav"
        nextClassName="catalog-pagination-item catalog-pagination-nav"
        previousLinkClassName="catalog-pagination-link catalog-pagination-link-nav"
        nextLinkClassName="catalog-pagination-link catalog-pagination-link-nav"
        breakClassName="catalog-pagination-item catalog-pagination-break"
        breakLinkClassName="catalog-pagination-link catalog-pagination-link-break"
        activeClassName="catalog-pagination-item-active"
        disabledClassName="catalog-pagination-item-disabled"
      />
    </nav>
  );
}
