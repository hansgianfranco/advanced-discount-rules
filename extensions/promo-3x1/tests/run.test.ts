import { describe, it, expect } from "vitest";
import { run } from "../src/run";
import { DiscountApplicationStrategy } from "../generated/api";

// Helper para simular un Line Item en el carrito
function createMockLine(
  id: string,
  price: number,
  quantity: number,
  productType: string = "curso virtual",
  discountAllocations: { discountedAmount: { amount: string } }[] = []
) {
  return {
    id,
    quantity,
    cost: {
      amountPerQuantity: {
        amount: price.toString(),
      },
    },
    discountAllocations,
    merchandise: {
      __typename: "ProductVariant" as const,
      id: `variant-${id}`,
      product: {
        id: `product-${id}`,
        productType,
      },
    },
  };
}

// Helper para crear una allocation de descuento
function withDiscount(totalDiscountAmount: number) {
  return [{ discountedAmount: { amount: totalDiscountAmount.toString() } }];
}

describe("Advanced 3x1 (llevas 3, pagas 1 = 2 gratis por trío)", () => {
  it("sin items → sin descuento", () => {
    const result = run({ cart: { lines: [] } } as any);
    expect(result.discounts).toHaveLength(0);
  });

  it("1 item → sin descuento", () => {
    const result = run({ cart: { lines: [createMockLine("l1", 900, 1)] } } as any);
    expect(result.discounts).toHaveLength(0);
  });

  it("2 items → sin descuento", () => {
    const result = run({
      cart: { lines: [createMockLine("l1", 900, 1), createMockLine("l2", 800, 1)] },
    } as any);
    expect(result.discounts).toHaveLength(0);
  });

  it("3 productos distintos (920, 585, 325) → 585 y 325 gratis, 920 paga", () => {
    // Ordenados por base: [325, 585, 920]
    // Trío 1: idx0=325 gratis, idx1=585 gratis, idx2=920 paga
    const input = {
      cart: {
        lines: [
          createMockLine("l-920", 920, 1),
          createMockLine("l-585", 585, 1),
          createMockLine("l-325", 325, 1),
        ],
      },
    };
    const result = run(input as any);
    expect(result.discountApplicationStrategy).toBe(DiscountApplicationStrategy.All);
    const ids = result.discounts.map(d => d.targets[0].cartLine.id);
    expect(ids).toContain("l-325");
    expect(ids).toContain("l-585");
    expect(ids).not.toContain("l-920");
    result.discounts.forEach(d => expect(d.value.percentage?.value).toBe(100.0));
  });

  it("3 unidades del mismo curso (qty=3) → 2 unidades gratis", () => {
    const input = { cart: { lines: [createMockLine("l1", 900, 3)] } };
    const result = run(input as any);
    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0].targets[0].cartLine.id).toBe("l1");
    expect(result.discounts[0].targets[0].cartLine.quantity).toBe(2);
    expect(result.discounts[0].value.percentage?.value).toBe(100.0);
  });

  it("2 líneas del mismo curso (qty=1 + qty=2) = 3 total → exactamente 2 gratis", () => {
    const input = {
      cart: {
        lines: [
          createMockLine("l-A", 900, 1),
          createMockLine("l-B", 900, 2),
        ],
      },
    };
    const result = run(input as any);
    const totalFreeQty = result.discounts.reduce(
      (acc, d) => acc + d.targets[0].cartLine.quantity, 0
    );
    expect(totalFreeQty).toBe(2);
  });

  it("4 productos → 1 trío = 2 gratis (325 y 500), 2 pagan (585 y 920)", () => {
    // Ordenados: [325, 500, 585, 920]
    // Trío 1: 325 gratis, 500 gratis, 585 paga
    // idx3 (920) sin trío → paga
    const input = {
      cart: {
        lines: [
          createMockLine("l-920", 920, 1),
          createMockLine("l-585", 585, 1),
          createMockLine("l-500", 500, 1),
          createMockLine("l-325", 325, 1),
        ],
      },
    };
    const result = run(input as any);
    const ids = result.discounts.map(d => d.targets[0].cartLine.id);
    expect(ids).toContain("l-325");
    expect(ids).toContain("l-500");
    expect(ids).not.toContain("l-585");
    expect(ids).not.toContain("l-920");
  });

  it("6 unidades → 2 tríos = 4 gratis, 2 pagan", () => {
    const input = { cart: { lines: [createMockLine("l1", 500, 6)] } };
    const result = run(input as any);
    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0].targets[0].cartLine.quantity).toBe(4);
  });

  it("6 productos distintos → 2 tríos, 4 gratis", () => {
    // Ordenados: [100, 200, 300, 400, 500, 600]
    // Trío 1: 100 gratis, 200 gratis, 300 paga
    // Trío 2: 400 gratis, 500 gratis, 600 paga
    const input = {
      cart: {
        lines: [
          createMockLine("l-600", 600, 1),
          createMockLine("l-500", 500, 1),
          createMockLine("l-400", 400, 1),
          createMockLine("l-300", 300, 1),
          createMockLine("l-200", 200, 1),
          createMockLine("l-100", 100, 1),
        ],
      },
    };
    const result = run(input as any);
    const ids = result.discounts.map(d => d.targets[0].cartLine.id);
    expect(ids).toContain("l-100");
    expect(ids).toContain("l-200");
    expect(ids).not.toContain("l-300");
    expect(ids).toContain("l-400");
    expect(ids).toContain("l-500");
    expect(ids).not.toContain("l-600");
  });

  it("Items no elegibles no cuentan para el trío", () => {
    // Elegibles: 3 cursos (585, 200, 100) → 1 trío → 100 y 200 gratis, 585 paga
    const input = {
      cart: {
        lines: [
          createMockLine("l-585", 585, 1, "curso virtual"),
          createMockLine("l-otro", 325, 1, "libro"),           // NO elegible
          createMockLine("l-200", 200, 1, "curso virtual"),
          createMockLine("l-100", 100, 1, "curso virtual"),
        ],
      },
    };
    const result = run(input as any);
    const ids = result.discounts.map(d => d.targets[0].cartLine.id);
    expect(ids).toContain("l-100");
    expect(ids).toContain("l-200");
    expect(ids).not.toContain("l-585");
    expect(ids).not.toContain("l-otro");
  });

  it("Descuento externo NO invierte selección: ordena por precio BASE", () => {
    // Línea A: base 900, descuento externo 270 → efectivo 630
    // Línea B: base 800
    // Línea C: base 700
    // Por BASE: [700(C), 800(B), 900(A)] → C y B gratis, A (más caro) paga
    const input = {
      cart: {
        lines: [
          createMockLine("l-A", 900, 1, "curso virtual", withDiscount(270)),
          createMockLine("l-B", 800, 1, "curso virtual"),
          createMockLine("l-C", 700, 1, "curso virtual"),
        ],
      },
    };
    const result = run(input as any);
    const ids = result.discounts.map(d => d.targets[0].cartLine.id);
    expect(ids).toContain("l-C"); // 700 gratis
    expect(ids).toContain("l-B"); // 800 gratis
    expect(ids).not.toContain("l-A"); // 900 paga
  });
});
