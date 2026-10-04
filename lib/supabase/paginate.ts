const PAGE_SIZE = 1000;

/**
 * supabase/config.tomlのmax_rows（1000）により、単純なselect("*")は
 * 1000件を超えると警告なく先頭1000件のみを返す。エクスポートは
 * 「全データ」が前提（requirements.md F-7, M-1）のため、range()で
 * 全件取得するまでページングする。
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) {
      return { data: null, error };
    }
    if (!data || data.length === 0) {
      break;
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) {
      break;
    }
    from += PAGE_SIZE;
  }

  return { data: rows, error: null };
}
