// Usage: node --env-file=../.env update-combines.mjs
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SHOP = process.env.SHOP;
const API_VERSION = process.env.API_VERSION;
const DISCOUNT_ID = process.env.DISCOUNT_ID;

// 1. Obtener access token via client_credentials
console.log("🔑 Obteniendo access token...");
const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
  }),
});

let accessToken = null;
if (tokenRes.ok) {
  const tokenData = await tokenRes.json();
  accessToken = tokenData.access_token;
  console.log("✅ Token obtenido:", accessToken ? accessToken.slice(0, 10) + "..." : "null");
} else {
  const err = await tokenRes.text();
  console.log("⚠️  client_credentials no soportado, intentando con client_secret como token...");
  console.log("Error:", tokenRes.status, err);
  // Algunos flujos de Shopify usan el client_secret directamente
  accessToken = CLIENT_SECRET;
}

// 2. Ejecutar la mutación
console.log("\n🚀 Ejecutando mutación discountAutomaticAppUpdate...");
const mutation = `
  mutation {
    discountAutomaticAppUpdate(
      id: "${DISCOUNT_ID}"
      automaticAppDiscount: {
        combinesWith: {
          orderDiscounts: true
          productDiscounts: true
          shippingDiscounts: true
        }
      }
    ) {
      automaticAppDiscount {
        discountId
        title
        combinesWith {
          orderDiscounts
          productDiscounts
          shippingDiscounts
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": accessToken,
  },
  body: JSON.stringify({ query: mutation }),
});

const data = await res.json();
console.log("\n📦 Respuesta:", JSON.stringify(data, null, 2));

const result = data.data?.discountAutomaticAppUpdate;
if (result?.userErrors?.length > 0) {
  console.log("\n❌ Errores:", result.userErrors);
} else if (result?.automaticAppDiscount) {
  const d = result.automaticAppDiscount;
  console.log(`\n✅ Descuento actualizado: "${d.title}"`);
  console.log(`   orderDiscounts:   ${d.combinesWith.orderDiscounts}`);
  console.log(`   productDiscounts: ${d.combinesWith.productDiscounts}`);
  console.log(`   shippingDiscounts:${d.combinesWith.shippingDiscounts}`);
}
