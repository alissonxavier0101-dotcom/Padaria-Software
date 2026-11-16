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

  let ultima: string | undefined;
  for (const venda of vendas) {
    if (venda.status === 'cancelado') continue;
    if (venda.clienteId !== clienteId) continue;
    if (!venda.formaPagamento || venda.formaPagamento === 'nao_informado') continue;
    ultima = String(venda.formaPagamento);
  }
  return ultima;
}
