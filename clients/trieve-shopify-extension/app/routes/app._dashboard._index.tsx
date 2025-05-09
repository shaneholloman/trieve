import {
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Layout,
  Link,
} from "@shopify/polaris";
import {
  CalendarIcon,
  EnvelopeIcon,
  QuestionCircleIcon,
} from "@shopify/polaris-icons";
import { Onboarding } from "app/components/onboarding/Onboarding";
import { Loader } from "app/loaders";
import { lastStepIdQuery, themeListQuery } from "app/queries/onboarding";
import { createServerLoader } from "app/loaders/serverLoader";
import { createClientLoader } from "app/loaders/clientLoader";
import { SearchFilterBar } from "app/components/analytics/FilterBar";
import { TopComponents } from "app/components/analytics/component/TopComponents";
import { TotalUniqueVisitors } from "app/components/analytics/component/TotalUniqueVisitors";
import { TopPages } from "app/components/analytics/component/TopPages";
import { useState } from "react";
import { defaultSearchAnalyticsFilter } from "app/queries/analytics/search";
import { Granularity } from "trieve-ts-sdk";
import { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "app/shopify.server";
import { PlanView } from "app/components/PlanView";
import { HomepageSyncStatus } from "app/components/HomepageSyncStatus";

const load: Loader = async ({ adminApiFetcher, queryClient }) => {
  await Promise.allSettled([
    queryClient.ensureQueryData(lastStepIdQuery(adminApiFetcher)),
    queryClient.ensureQueryData(themeListQuery(adminApiFetcher)),
  ]);
  return;
};

export const loader = createServerLoader(load);
export const clientLoader = createClientLoader(load);

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("Receives action");
  const { redirect, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  if (action === "modify") {
    console.log("Redirecting to pricing page");
    return redirect(process.env.SHOPIFY_PRICING_URL || "", {
      target: "_top",
    });
  } else if (action === "cancel") {
    console.log("Cancelling subscription");
    const subscription = await billing.check();
    if (subscription.hasActivePayment) {
      await billing.cancel({
        subscriptionId: subscription.appSubscriptions[0].id,
      });
    }
    return redirect("/app");
  }
  return null;
};

export default function Dashboard() {
  const [filters, setFilters] = useState(defaultSearchAnalyticsFilter);
  const [granularity, setGranularity] = useState<Granularity>("day");

  return (
    <>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Onboarding />
            <SearchFilterBar
              granularity={granularity}
              setGranularity={setGranularity}
              filters={filters}
              setFilters={setFilters}
              options={{ hideComponentName: true }}
            />
            <TopComponents filters={filters} />
            <SearchFilterBar
              granularity={granularity}
              setGranularity={setGranularity}
              filters={filters}
              setFilters={setFilters}
              options={{ hideDateRange: true }}
            />
            <Layout>
              <Layout.Section variant="oneHalf">
                <TotalUniqueVisitors
                  filters={filters}
                  granularity={granularity}
                />
              </Layout.Section>
              <Layout.Section variant="oneHalf">
                <TopPages filters={filters} />
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingLg" as="h1">
                  Get support
                </Text>
                <Text variant="bodyLg" as="p">
                  We would love to hear from you about anything at all. Email{" "}
                  <Link url="mailto:humans@trieve.ai" target="_blank">
                    humans@trieve.ai
                  </Link>{" "}
                  or call{" "}
                  <Link url="tel:+16282224090" target="_blank">
                    628-222-4090
                  </Link>{" "}
                  to quickly get in touch with a human on our team.
                </Text>
                <Text variant="bodyLg" as="p">
                  Or visit the{" "}
                  <Link
                    url="https://docs.trieve.ai/site-search/introduction"
                    target="_blank"
                  >
                    support center
                  </Link>{" "}
                  for answers to common questions, video tutorials,
                  documentation, and more.
                </Text>
                <InlineStack align="start" gap="300">
                  <Button
                    icon={QuestionCircleIcon}
                    size="large"
                    url="https://docs.trieve.ai/site-search/introduction"
                    target="_blank"
                  >
                    Support Center
                  </Button>
                  <Button
                    icon={EnvelopeIcon}
                    size="large"
                    url="mailto:humans@trieve.ai"
                    target="_blank"
                  >
                    Email Us
                  </Button>
                  <Button
                    icon={CalendarIcon}
                    size="large"
                    url="https://cal.com/team/trieve/chat"
                    target="_blank"
                  >
                    Book a Call
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
            <HomepageSyncStatus />
            <PlanView />
          </BlockStack>
        </Layout.Section>
      </Layout>
    </>
  );
}
