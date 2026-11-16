/**
 * Retorna a última forma de pagamento usada por um cliente em vendas
 * não canceladas, ou undefined se não houver histórico.
 *
 * - `clienteId`: id do cliente.
 * - `vendas`: histórico de vendas (cada uma com clienteId, formaPagamento, status).
 */
export function ultimaFormaPagamentoDoCliente(
  clienteId: string | null | undefined,
  vendas: readonly Array<{ clienteId?: unknown; formaPagamento?: unknown; status?: unknown }>
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
