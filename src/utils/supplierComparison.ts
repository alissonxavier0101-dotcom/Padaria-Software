export type SupplierOfferUnit = 'kg' | 'g' | 'L' | 'ml' | 'un';

export interface SupplierOffer {
  id: string;
  nome: string;
  grupoComparacao?: string;
  unidade: SupplierOfferUnit;
  quantidade: number;
  preco: number;
  custoUnitario?: number;
}

export interface ComparableSupplierOffer<T extends SupplierOffer = SupplierOffer> {
  offer: T;
  comparisonKey: string;
  baseUnit: 'g' | 'ml' | 'un';
  pricePerBaseUnit: number;
}

export interface SupplierOfferGroup<T extends SupplierOffer = SupplierOffer> {
  key: string;
  nome: string;
  baseUnit: 'g' | 'ml' | 'un';
  offers: Array<ComparableSupplierOffer<T>>;
}

function getUnitDetails(unit: SupplierOfferUnit) {
  if (unit === 'kg') return { dimension: 'mass', baseUnit: 'g' as const, factor: 1000 };
  if (unit === 'g') return { dimension: 'mass', baseUnit: 'g' as const, factor: 1 };
  if (unit === 'L') return { dimension: 'volume', baseUnit: 'ml' as const, factor: 1000 };
  if (unit === 'ml') return { dimension: 'volume', baseUnit: 'ml' as const, factor: 1 };
  return { dimension: 'count', baseUnit: 'un' as const, factor: 1 };
}

export function normalizeComparisonName(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ');
}

export function getSupplierOfferComparisonKey(offer: SupplierOffer): string {
  const details = getUnitDetails(offer.unidade);
  return `${normalizeComparisonName(offer.grupoComparacao || offer.nome)}:${details.dimension}`;
}

export function compareSupplierOffers<T extends SupplierOffer>(offers: T[]): SupplierOfferGroup<T>[] {
  const groups = new Map<string, SupplierOfferGroup<T>>();

  for (const offer of offers) {
    const name = offer.grupoComparacao?.trim() || offer.nome.trim();
    const normalizedName = normalizeComparisonName(name);
    if (!normalizedName) continue;

    const details = getUnitDetails(offer.unidade);
    const key = `${normalizedName}:${details.dimension}`;
    const packageQuantity = Number(offer.quantidade);
    const packagePrice = Number(offer.preco);
    if (!Number.isFinite(packageQuantity) || packageQuantity <= 0 ||
        !Number.isFinite(packagePrice) || packagePrice <= 0) continue;

    const pricePerBaseUnit = Math.round((packagePrice / packageQuantity / details.factor) * 1_000_000) / 1_000_000;
    const group = groups.get(key) || {
      key,
      nome: name,
      baseUnit: details.baseUnit,
      offers: []
    };
    group.offers.push({ offer, comparisonKey: key, baseUnit: details.baseUnit, pricePerBaseUnit });
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map(group => ({
      ...group,
      offers: group.offers.sort((left, right) =>
        left.pricePerBaseUnit - right.pricePerBaseUnit ||
        left.offer.nome.localeCompare(right.offer.nome, 'pt-BR')
      )
    }))
    .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'));
}
