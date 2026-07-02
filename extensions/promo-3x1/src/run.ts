import type {
  RunInput,
  FunctionRunResult,
  Discount,
  Target
} from "../generated/api";
import {
  DiscountApplicationStrategy,
} from "../generated/api";

/**
 * Mensaje que se mostrará en el carrito y checkout al aplicar la promoción.
 */
const PROMO_MESSAGE = "Promoción 3x1 (Llevas 3, pagas 1)";

const EMPTY_DISCOUNT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.All,
  discounts: [],
};

/**
 * Estructura para representar cada artículo individual expandido del carrito.
 */
interface IndividualItem {
  cartLineId: string;
  /** Precio efectivo (después de descuentos previos aplicados a la línea). */
  price: number;
  /** Precio base de catálogo sin descuentos externos. */
  basePrice: number;
}

/**
 * Calcula el precio efectivo de una línea restando los descuentAllocations prorrateados.
 * Si los discountAllocations están vacíos, usa directamente amountPerQuantity
 * que en Shopify ya refleja el precio de catálogo (incluye precios de oferta).
 */
function getEffectiveUnitPrice(line: RunInput["cart"]["lines"][0]): number {
  const basePrice = parseFloat(line.cost.amountPerQuantity.amount);
  if (isNaN(basePrice)) return 0;

  // Sumar todos los descuentos externos ya asignados a esta línea
  let totalExternalDiscount = 0;
  if (line.discountAllocations && line.discountAllocations.length > 0) {
    for (const allocation of line.discountAllocations) {
      const amount = parseFloat(allocation.discountedAmount.amount);
      if (!isNaN(amount)) {
        totalExternalDiscount += amount;
      }
    }
  }

  // El precio efectivo por unidad, nunca negativo
  const discountPerUnit = totalExternalDiscount / Math.max(line.quantity, 1);
  return Math.max(0, basePrice - discountPerUnit);
}

/**
 * Función principal que ejecuta la lógica de descuento en Shopify.
 */
export function run(input: RunInput): FunctionRunResult {
  // 1. Obtener todas las líneas del carrito
  const lines = input.cart?.lines ?? [];

  // LOGS DE DEPURACIÓN
  console.error(`[DEBUG 3x1] Total líneas en carrito: ${lines.length}`);
  for (const line of lines) {
    if (line.merchandise.__typename === "ProductVariant") {
      const product = line.merchandise.product;
      const effectivePrice = getEffectiveUnitPrice(line);
      console.error(
        `[DEBUG 3x1] Línea: ${line.id} | Tipo: "${product.productType}" | PrecioBase: ${line.cost.amountPerQuantity.amount} | PrecioEfectivo: ${effectivePrice} | Qty: ${line.quantity} | DiscountAllocs: ${line.discountAllocations.length}`
      );
    }
  }

  if (lines.length === 0) {
    return EMPTY_DISCOUNT;
  }

  // 2. Filtrar artículos elegibles: solo productos con productType "curso virtual"
  const eligibleLines = lines.filter(line => {
    if (line.merchandise.__typename === "ProductVariant") {
      const productType = (line.merchandise.product.productType || "").toLowerCase().trim();
      const isEligible = productType === "curso virtual";
      if (!isEligible) {
        console.error(`[DEBUG 3x1] Línea ${line.id} NO elegible. Tipo: "${line.merchandise.product.productType}"`);
      }
      return isEligible;
    }
    return false;
  });

  console.error(`[DEBUG 3x1] Líneas elegibles: ${eligibleLines.length}`);

  if (eligibleLines.length === 0) {
    return EMPTY_DISCOUNT;
  }

  // 3. Expandir las cantidades usando el precio base de catálogo (amountPerQuantity).
  //    Usamos basePrice para ordenar y seleccionar el item "más barato" del 3x1,
  //    ignorando descuentos externos de otras apps. Esto evita que el 3x1 se aplique
  //    a un item que ya tiene otro descuento (doble descuento ineficiente) y garantiza
  //    que el cliente vea correctamente qué producto queda gratis.
  const expandedItems: IndividualItem[] = [];
  for (const line of eligibleLines) {
    const basePrice = parseFloat(line.cost.amountPerQuantity.amount);
    if (isNaN(basePrice) || basePrice < 0) {
      console.error(`[DEBUG 3x1] Línea ${line.id} omitida por precio inválido: ${line.cost.amountPerQuantity.amount}`);
      continue;
    }

    const effectivePrice = getEffectiveUnitPrice(line);
    console.error(`[DEBUG 3x1] Línea ${line.id} | PrecioBase: ${basePrice} | PrecioEfectivo: ${effectivePrice} | DiscountAllocs: ${line.discountAllocations.length}`);

    for (let i = 0; i < line.quantity; i++) {
      expandedItems.push({
        cartLineId: line.id,
        price: basePrice,   // ordenar/seleccionar por precio base de catálogo
        basePrice,
      });
    }
  }

  console.error(`[DEBUG 3x1] Items expandidos: ${expandedItems.length}`);

  if (expandedItems.length < 3) {
    // Si hay menos de 3 artículos elegibles, no se puede formar ningún trío.
    return EMPTY_DISCOUNT;
  }

  // 4. Ordenar TODOS los artículos individuales por precio BASE ASCENDENTE
  //    (precio de catálogo, sin descuentos de otras apps)
  expandedItems.sort((a, b) => a.price - b.price);

  // 5. Calcular la cantidad de artículos gratuitos.
  //    3x1 = llevas 3, pagas 1 → por cada trío, 2 son gratis.
  //    freeCount = floor(total / 3) * 2
  const totalItems = expandedItems.length;
  const trioCount = Math.floor(totalItems / 3);
  const freeCount = trioCount * 2;

  console.error(`[DEBUG 3x1] Tríos completos: ${trioCount} | Artículos gratuitos: ${freeCount}`);

  if (freeCount <= 0) {
    return EMPTY_DISCOUNT;
  }

  // 6. Lógica de TRÍOS: los items están ordenados por precio base ASCENDENTE.
  //    Trío 1 = (índice 0, 1, 2) → índices 0 y 1 son gratis, índice 2 paga
  //    Trío 2 = (índice 3, 4, 5) → índices 3 y 4 son gratis, índice 5 paga
  //    Regla: en cada trío los 2 MÁS BARATOS son gratis; el MÁS CARO paga.
  const freeQuantitiesByLineId: Record<string, number> = {};
  for (let t = 0; t < trioCount; t++) {
    const base = t * 3;
    // Los 2 más baratos del trío (índices base y base+1) son gratuitos
    for (let offset = 0; offset <= 1; offset++) {
      const item = expandedItems[base + offset];
      freeQuantitiesByLineId[item.cartLineId] = (freeQuantitiesByLineId[item.cartLineId] || 0) + 1;
    }
    console.error(
      `[DEBUG 3x1] Trío ${t + 1}: ` +
      `gratis=${expandedItems[base].price} (idx ${base}), ` +
      `gratis=${expandedItems[base + 1].price} (idx ${base + 1}), ` +
      `paga=${expandedItems[base + 2]?.price ?? '?'} (idx ${base + 2})`
    );
  }

  // 7. Construir los targets de descuento de Shopify
  const discounts: Discount[] = [];
  for (const [lineId, quantityToDiscount] of Object.entries(freeQuantitiesByLineId)) {
    discounts.push({
      targets: [
        {
          cartLine: {
            id: lineId,
            quantity: quantityToDiscount,
          },
        },
      ],
      value: {
        percentage: {
          value: 100.0,
        },
      },
      message: PROMO_MESSAGE,
    });
  }

  // 8. Retornar el resultado de la función con los descuentos calculados
  //    DiscountApplicationStrategy.All → Shopify aplica TODOS los descuentos
  //    del array (necesario para que ambos items gratuitos del trío queden gratis).
  return {
    discountApplicationStrategy: DiscountApplicationStrategy.All,
    discounts,
  };
}