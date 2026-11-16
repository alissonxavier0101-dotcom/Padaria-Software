/**
 * Retorna a última forma de pagamento usada por um cliente em vendas
 * não canceladas, ou undefined se não houver histórico.
 *
 * - `clienteId`: id do cliente.
 * - `vendas`: histórico de vendas (cada uma com clienteId, formaPagamento,
 *   status e data). As vendas são ordenadas por data (mais recente primeiro)
 *   antes de escolher a última forma de pagamento.
 */
export function ultimaFormaPagamentoDoCliente(
  clienteId: string | null | undefined,
  vendas: readonly {
    clienteId?: unknown;
    formaPagamento?: unknown;
    status?: unknown;
    data?: unknown;
  }[]
): string | undefined {
  if (!clienteId) return undefined;

  const filtradas = Array.from(vendas)
    .filter((venda) => venda.status !== 'cancelado')
    .filter((venda) => venda.clienteId === clienteId)
    .filter((venda) => venda.formaPagamento && venda.formaPagamento !== 'nao_informado')
    .sort((a, b) => {
      const dataA = String(a.data ?? '');
      const dataB = String(b.data ?? '');
      if (dataA < dataB) return 1;
      if (dataA > dataB) return -1;
      return 0;
    });

  if (filtradas.length === 0) return undefined;
  return String(filtradas[0].formaPagamento);
}
