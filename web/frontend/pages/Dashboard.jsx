import React, { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  DataTable,
  Spinner,
  Tabs,
  List,
  Link,
  Divider,
} from "@shopify/polaris";
import { DiscountIcon, ProductIcon, InfoIcon } from "@shopify/polaris-icons";

function getToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || params.get("id_token") || null;
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  return res.json();
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status) {
  switch (status) {
    case "ACTIVE": return { label: "Activo", variant: "success" };
    case "EXPIRED": return { label: "Expirado", variant: "critical" };
    case "SCHEDULED": return { label: "Programado", variant: "info" };
    default: return { label: status || "—", variant: "info" };
  }
}

export default function Dashboard() {
  const [selectedTab, setSelectedTab] = useState(0);
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [toast, setToast] = useState(null);

  const loadDiscounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api("/api/discount");
      if (data.error) setError(data.error);
      else setDiscounts(data.discounts || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadDiscounts(); }, [loadDiscounts]);

  const toggleDiscount = async (discount, activate) => {
    setToggling(discount.discountId);
    const result = await api("/api/discount/toggle", {
      method: "POST",
      body: JSON.stringify({
        discountId: discount.discountId,
        status: activate,
      }),
    });
    setToggling(null);
    if (result.error) {
      setToast({ message: `Error: ${result.error}`, error: true });
    } else {
      setToast({ message: activate ? "Descuento activado" : "Descuento desactivado", error: false });
      loadDiscounts();
    }
    setTimeout(() => setToast(null), 4000);
  };

  const tabs = [
    { id: "overview", content: "Resumen" },
    { id: "discounts", content: "Descuentos" },
    { id: "how-it-works", content: "Cómo funciona" },
  ];

  const mainDiscount = discounts.find((d) => d.status === "ACTIVE");
  const allDiscounts = discounts;

  return (
    <Page title="Advanced Discount Rules" subtitle="Administración de la promoción 3x1">
      {toast && (
        <Banner tone={toast.error ? "critical" : "success"} onDismiss={() => setToast(null)}>
          {toast.message}
        </Banner>
      )}

      <Layout>
        {!getToken() && (
          <Layout.Section>
            <Banner tone="info">
              Para gestionar los descuentos, abre esta app desde el admin de Shopify.
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />
          </Card>
        </Layout.Section>

        {selectedTab === 0 && (
          <>
            <Layout.Section variant="oneThird">
              <Card roundedAbove="sm">
                <BlockStack gap="200" align="center">
                  <Text variant="headingXl" as="h2" alignment="center">
                    {loading ? <Spinner size="small" /> : mainDiscount ? "ACTIVO" : "INACTIVO"}
                  </Text>
                  <Badge
                    tone={mainDiscount ? "success" : "critical"}
                    size="large"
                  >
                    {mainDiscount ? "3x1 Activo" : "Sin descuento activo"}
                  </Badge>
                  <Text variant="bodySm" as="p" tone="subdued">
                    {mainDiscount
                      ? `Desde ${formatDate(mainDiscount.startsAt)}`
                      : "No hay promoción 3x1 activa"}
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card roundedAbove="sm">
                <BlockStack gap="200">
                  <InlineStack align="center" gap="200">
                    <ProductIcon />
                    <Text variant="headingMd" as="h3">
                      Productos elegibles
                    </Text>
                  </InlineStack>
                  <Text variant="bodyLg" as="p" fontWeight="bold">
                    Curso Virtual
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Solamente productos con tipo "Curso Virtual"
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card roundedAbove="sm">
                <BlockStack gap="200">
                  <InlineStack align="center" gap="200">
                    <DiscountIcon />
                    <Text variant="headingMd" as="h3">
                      Regla aplicada
                    </Text>
                  </InlineStack>
                  <Text variant="bodyLg" as="p" fontWeight="bold">
                    3x1
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Cada 3 productos, el más barato es gratis
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          </>
        )}

        {selectedTab === 1 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">Descuentos 3x1</Text>
                  {!loading && allDiscounts.length === 0 && (
                    <Button
                      variant="primary"
                      url={`https://ernm4z-cw.myshopify.com/admin/discounts/new?type=product`}
                      external
                    >
                      Crear descuento
                    </Button>
                  )}
                </InlineStack>

                {loading ? (
                  <div style={{ textAlign: "center", padding: "2rem" }}>
                    <Spinner size="large" />
                  </div>
                ) : error ? (
                  <Banner tone="critical">
                    Error cargando descuentos: {error}
                  </Banner>
                ) : allDiscounts.length === 0 ? (
                  <Banner tone="info">
                    No hay descuentos 3x1 configurados. Crea uno desde la sección de descuentos.
                  </Banner>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text"]}
                    headings={["Título", "Estado", "Inicio", "Fin", "Acciones"]}
                    rows={allDiscounts.map((d) => {
                      const status = formatStatus(d.status);
                      return [
                        <Text variant="bodyMd" as="span" fontWeight="bold">
                          {d.title}
                        </Text>,
                        <Badge tone={status.variant}>{status.label}</Badge>,
                        formatDate(d.startsAt),
                        formatDate(d.endsAt),
                        <InlineStack gap="200">
                          <Button
                            size="slim"
                            variant={d.status === "ACTIVE" ? "secondary" : "primary"}
                            loading={toggling === d.discountId}
                            onClick={() =>
                              toggleDiscount(d, d.status !== "ACTIVE")
                            }
                          >
                            {d.status === "ACTIVE" ? "Desactivar" : "Activar"}
                          </Button>
                          <Button
                            size="slim"
                            variant="plain"
                            external
                            url={`https://admin.shopify.com/store/ernm4z-cw/discounts/${d.discountId.split("/").pop()}`}
                          >
                            Ver
                          </Button>
                        </InlineStack>,
                      ];
                    })}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {selectedTab === 2 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">¿Cómo funciona el 3x1?</Text>

                <Card padding="400" background="bg-surface-secondary">
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">Regla</Text>
                    <Text as="p">
                      Al agregar 3 o más productos de tipo{" "}
                      <Text fontWeight="bold" as="span">"Curso Virtual"</Text> al carrito,
                      el de menor precio del grupo se aplica con 100% de descuento.
                    </Text>
                  </BlockStack>
                </Card>

                <Card padding="400" background="bg-surface-secondary">
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">Ejemplo</Text>
                    <List>
                      <List.Item>
                        <Text as="span" fontWeight="bold">3 cursos:</Text> S/50, S/80, S/120 → el de S/50 es gratis
                      </List.Item>
                      <List.Item>
                        <Text as="span" fontWeight="bold">6 cursos:</Text> se forman 2 tríos → 2 gratuitos
                      </List.Item>
                      <List.Item>
                        <Text as="span" fontWeight="bold">4 cursos:</Text> solo 1 trío completo → 1 gratis, el 4to paga
                      </List.Item>
                    </List>
                  </BlockStack>
                </Card>

                <Card padding="400" background="bg-surface-secondary">
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">Combinación</Text>
                    <Text as="p">
                      Este descuento se puede combinar con otros descuentos de producto,
                      pero no con descuentos de orden ni envío.
                    </Text>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
