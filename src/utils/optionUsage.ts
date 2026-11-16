/**
 * Ordena opções de select colocando as três mais usadas no topo,
 * seguidas das demais em ordem alfabética.
 *
 * - `opcoes`: array de { valor, rotulo }.
 * - `historico`: array de vendas (ou qualquer registro com um campo que
 *   vincule a opção e um campo `status`).
 * - `obterChave`: função que extrai, de cada registro do histórico, o id
 *   da opção a ser contabilizada. Padrão: `produtoId`.
 * - Vendas com `status === 'cancelado'` são ignoradas na contagem.
 *
 * Devolve um novo array de { valor, rotulo, usos, ehMaisUsado }.
 * `ehMaisUsado` é true apenas para as três primeiras opções com pelo
 * menos um uso.
 */
export interface OpcaoOrdenada {
  valor: string;
  rotulo: string;
  usos: number;
  ehMaisUsado: boolean;
}

type ObterChave = (registro: Record<string, unknown>) => string | undefined;

export function ordenarOpcoesPorUso(
  opcoes: readonly { valor: string; rotulo: string }[],
  historico: readonly Record<string, unknown>[],
  obterChave: ObterChave = (registro) => registro['produtoId'] as string | undefined
): OpcaoOrdenada[] {
  const contagem = new Map<string, number>();

  for (const registro of historico) {
    if (registro['status'] === 'cancelado') continue;
    const chave = obterChave(registro);
    if (chave === undefined || chave === null || chave === '') continue;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }

  const opcoesComUso = Array.from(opcoes).map((opcao) => ({
    ...opcao,
    usos: contagem.get(opcao.valor) ?? 0
  }));

  const maisUsados = opcoesComUso
    .filter((opcao) => opcao.usos > 0)
    .sort((a, b) => b.usos - a.usos || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
    .slice(0, 3)
    .map((opcao) => ({ ...opcao, ehMaisUsado: true }));

  const demais = opcoesComUso
    .filter((opcao) => opcao.usos === 0 || !maisUsados.some((m) => m.valor === opcao.valor))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
    .map((opcao) => ({ ...opcao, ehMaisUsado: false }));

  return [...maisUsados, ...demais];
}
