export function normalizarTextoBusca(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export function correspondeBusca(
  consulta: string,
  campos: Array<string | null | undefined>
): boolean {
  const termos = normalizarTextoBusca(consulta).trim().split(/\s+/).filter(Boolean);
  if (termos.length === 0) return true;
  const texto = normalizarTextoBusca(campos.filter(Boolean).join(' '));
  return termos.every((termo) => texto.includes(termo));
}
