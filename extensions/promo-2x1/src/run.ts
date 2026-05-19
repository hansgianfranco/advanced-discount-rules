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
const PROMO_MESSAGE = "Promoción 2x1 (Gratis el de menor precio)";

const EMPTY_DISCOUNT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

/**
 * Estructura para representar cada artículo individual expandido del carrito.
 */
interface IndividualItem {
  cartLineId: string;
  price: number;
}

/**
 * Función principal que ejecuta la lógica de descuento en Shopify.
 */
export function run(input: RunInput): FunctionRunResult {
  // 1. Obtener todas las líneas del carrito
  const lines = input.cart?.lines ?? [];
  if (lines.length === 0) {
    return EMPTY_DISCOUNT;
  }

  // 2. Filtrar los artículos elegibles (Cursos o Especializaciones)
  // Robustez: Comprobamos tanto el productType como los tags del producto.
  const eligibleLines = lines.filter(line => {
    if (line.merchandise.__typename === "ProductVariant") {
      const product = line.merchandise.product;
      const productType = (product.productType || "").toLowerCase().trim();
      const hasEligibleType = productType.includes("curso") || productType.includes("especializa");
      const hasEligibleTag = product.hasAnyTag === true;
      return hasEligibleType || hasEligibleTag;
    }
    return false;
  });

  if (eligibleLines.length === 0) {
    return EMPTY_DISCOUNT;
  }

  // 3. Expandir las cantidades: si quantity = 3, agregamos 3 ítems individuales.
  // Usamos line.cost.amountPerQuantity.amount como el precio unitario del line item.
  const expandedItems: IndividualItem[] = [];
  for (const line of eligibleLines) {
    const price = parseFloat(line.cost.amountPerQuantity.amount);
    if (isNaN(price) || price <= 0) {
      continue;
    }
    for (let i = 0; i < line.quantity; i++) {
      expandedItems.push({
        cartLineId: line.id,
        price,
      });
    }
  }

  if (expandedItems.length < 2) {
    // Si hay menos de 2 artículos elegibles, no se puede formar ningún par.
    return EMPTY_DISCOUNT;
  }

  // 4. Ordenar TODOS los artículos individuales por precio de forma ASCENDENTE.
  expandedItems.sort((a, b) => a.price - b.price);

  // 5. Calcular la cantidad de artículos gratuitos (N = floor(total_items / 2))
  const totalItems = expandedItems.length;
  const freeCount = Math.floor(totalItems / 2);

  if (freeCount <= 0) {
    return EMPTY_DISCOUNT;
  }

  // 6. Los N artículos más baratos serán gratuitos.
  // Agrupamos la cantidad de gratuitos por cartLineId para aplicar el descuento consolidado.
  const freeQuantitiesByLineId: Record<string, number> = {};
  for (let i = 0; i < freeCount; i++) {
    const item = expandedItems[i];
    freeQuantitiesByLineId[item.cartLineId] = (freeQuantitiesByLineId[item.cartLineId] || 0) + 1;
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
  return {
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts,
  };
}