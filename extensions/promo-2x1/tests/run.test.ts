import { describe, it, expect } from "vitest";
import { run } from "../src/run";
import { DiscountApplicationStrategy } from "../generated/api";

// Helper para simular un Line Item en el carrito
function createMockLine(id: string, price: number, quantity: number, productType: string = "Curso", hasTag: boolean = false) {
  return {
    id,
    quantity,
    cost: {
      amountPerQuantity: {
        amount: price.toString(),
      },
    },
    merchandise: {
      __typename: "ProductVariant" as const,
      id: `variant-${id}`,
      product: {
        id: `product-${id}`,
        productType,
        hasAnyTag: hasTag,
      },
    },
  };
}

describe("Advanced 2x1 Promotion Discount Logic", () => {
  it("should return no discounts when cart is empty", () => {
    const input = {
      cart: {
        lines: [],
      },
      discountNode: {
        metafield: null,
      },
    };

    const result = run(input);
    expect(result.discounts).toHaveLength(0);
  });

  it("should return no discounts if only 1 item is in the cart (Caso 1 impar)", () => {
    const input = {
      cart: {
        lines: [
          createMockLine("line-1", 585, 1),
        ],
      },
      discountNode: {
        metafield: null,
      },
    };

    const result = run(input);
    expect(result.discounts).toHaveLength(0);
  });

  it("Caso 1: 2 productos (585, 325) -> 325 gratis, cliente paga 585", () => {
    const input = {
      cart: {
        lines: [
          createMockLine("line-1", 585, 1),
          createMockLine("line-2", 325, 1),
        ],
      },
      discountNode: {
        metafield: null,
      },
    };

    const result = run(input);
    expect(result.discountApplicationStrategy).toBe(DiscountApplicationStrategy.First);
    expect(result.discounts).toHaveLength(1);

    // Debería aplicar el 100% de descuento al producto más barato (325, line-2)
    const discount = result.discounts[0];
    expect(discount.targets[0].cartLine.id).toBe("line-2");
    expect(discount.targets[0].cartLine.quantity).toBe(1);
    expect(discount.value.percentage?.value).toBe(100.0);
  });

  it("Caso 2: 3 productos (920, 585, 325) -> 325 gratis, 920 y 585 pagados", () => {
    const input = {
      cart: {
        lines: [
          createMockLine("line-1", 920, 1),
          createMockLine("line-2", 585, 1),
          createMockLine("line-3", 325, 1),
        ],
      },
      discountNode: {
        metafield: null,
      },
    };

    const result = run(input);
    expect(result.discounts).toHaveLength(1);

    // El más barato es 325 (line-3)
    const discount = result.discounts[0];
    expect(discount.targets[0].cartLine.id).toBe("line-3");
    expect(discount.targets[0].cartLine.quantity).toBe(1);
  });

  it("Caso 3: 4 productos (920, 585, 500, 325) -> 325 y 500 gratis, 920 y 585 pagados", () => {
    const input = {
      cart: {
        lines: [
          createMockLine("line-1", 920, 1),
          createMockLine("line-2", 585, 1),
          createMockLine("line-3", 500, 1),
          createMockLine("line-4", 325, 1),
        ],
      },
      discountNode: {
        metafield: null,
      },
    };

    const result = run(input);
    expect(result.discounts).toHaveLength(2);

    // Los dos más baratos son 325 (line-4) y 500 (line-3)
    const discountIds = result.discounts.map(d => d.targets[0].cartLine.id);
    expect(discountIds).toContain("line-3");
    expect(discountIds).toContain("line-4");

    result.discounts.forEach(discount => {
      expect(discount.value.percentage?.value).toBe(100.0);
      expect(discount.targets[0].cartLine.quantity).toBe(1);
    });
  });

  it("Caso 4: 5 productos (1000, 900, 800, 700, 600) -> 600 y 700 gratis, 800, 900 y 1000 pagados", () => {
    const input = {
      cart: {
        lines: [
          createMockLine("line-1", 1000, 1),
          createMockLine("line-2", 900, 1),
          createMockLine("line-3", 800, 1),
          createMockLine("line-4", 700, 1),
          createMockLine("line-5", 600, 1),
        ],
      },
      discountNode: {
        metafield: null,
      },
    };

    const result = run(input);
    expect(result.discounts).toHaveLength(2);

    // Los dos más baratos son 600 (line-5) y 700 (line-4)
    const discountIds = result.discounts.map(d => d.targets[0].cartLine.id);
    expect(discountIds).toContain("line-4");
    expect(discountIds).toContain("line-5");
  });

  it("Múltiples cantidades de un mismo artículo: quantity = 3 de 500 -> 1 gratis, 2 pagados", () => {
    const input = {
      cart: {
        lines: [
          createMockLine("line-1", 500, 3), // Total 3 artículos del mismo tipo
        ],
      },
      discountNode: {
        metafield: null,
      },
    };

    const result = run(input);
    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0].targets[0].cartLine.id).toBe("line-1");
    expect(result.discounts[0].targets[0].cartLine.quantity).toBe(1); // 1 gratis de los 3
  });

  it("Artículos no elegibles no deben recibir descuentos ni contarse en la promoción", () => {
    const input = {
      cart: {
        lines: [
          createMockLine("line-1", 585, 1, "Curso"),          // Elegible
          createMockLine("line-2", 325, 1, "OtrosProductos"), // NO elegible
          createMockLine("line-3", 200, 1, "Curso"),          // Elegible
        ],
      },
      discountNode: {
        metafield: null,
      },
    };

    const result = run(input);
    // Elegibles expandidos: [200 (Curso), 585 (Curso)]
    // Total elegibles = 2. N = 1 gratis.
    // El más barato elegible es 200 (line-3).
    // El no elegible (325, line-2) no entra al 2x1 y no debe ser gratuito.
    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0].targets[0].cartLine.id).toBe("line-3");
    expect(result.discounts[0].targets[0].cartLine.quantity).toBe(1);
  });
});
