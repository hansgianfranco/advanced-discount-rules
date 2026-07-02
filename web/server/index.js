import express from "express";
import compression from "compression";

const PORT = parseInt(process.env.PORT || "3000", 10);
const DEV = process.env.NODE_ENV !== "production";

const app = express();
app.use(compression());
app.use(express.json());

if (DEV) {
  app.get("/api/auth", (req, res) => {
    res.redirect(`/?shop=${req.query.shop || "ernm4z-cw.myshopify.com"}`);
  });
}

app.get("/api/discount", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "No token" });

    const query = `{
      discountAutomaticNodes(first: 10) {
        edges {
          node {
            ... on DiscountAutomaticApp {
              discountId
              title
              status
              functionHandle
              startsAt
              endsAt
              asyncUsageCount
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
          }
        }
      }
    }`;

    const response = await fetch(
      `https://ernm4z-cw.myshopify.com/admin/api/2026-07/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query }),
      }
    );
    const data = await response.json();

    const discounts = data.data?.discountAutomaticNodes?.edges
      ?.map((e) => e.node)
      .filter((d) => d.functionHandle === "promo-3x1") || [];

    res.json({ discounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/discount/toggle", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const { discountId, status } = req.body;
    if (!token || !discountId) return res.status(401).json({ error: "Missing params" });

    const mutation = `mutation {
      discountAutomaticAppUpdate(
        id: "${discountId}"
        automaticAppDiscount: { status: ${status ? "ACTIVE" : "EXPIRED"} }
      ) {
        userErrors { field message }
      }
    }`;

    const response = await fetch(
      `https://ernm4z-cw.myshopify.com/admin/api/2026-07/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query: mutation }),
      }
    );
    const data = await response.json();
    res.json(data.data?.discountAutomaticAppUpdate || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (!DEV) {
  app.use(express.static("dist"));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
