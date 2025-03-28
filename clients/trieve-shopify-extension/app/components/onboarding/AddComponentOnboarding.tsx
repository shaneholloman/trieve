import { useRouteLoaderData } from "@remix-run/react";
import { Button, Text } from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { useQuery } from "@tanstack/react-query";
import { useClientAdminApi } from "app/loaders/clientLoader";
import { themeSettingsQuery } from "app/queries/onboarding";
import { OnboardingBody } from "app/utils/onboarding";
import { useShopName } from "app/utils/useShopName";
import { useEffect, useMemo } from "react";

export const AddComponentOnboarding: OnboardingBody = ({
  broadcastCompletion,
}) => {
  const adminApi = useClientAdminApi();

  const { data } = useQuery({
    ...themeSettingsQuery(adminApi),
    refetchInterval: 1000,
    placeholderData: {},
  });

  const complete = useMemo(() => {
    const stringified = JSON.stringify(data);
    if (stringified?.includes("trieve.ai")) return true;
    return false;
  }, [data]);

  const shopname = useShopName();

  const { shopifyThemeAppExtensionUuid } = useRouteLoaderData("routes/app") as {
    shopifyThemeAppExtensionUuid?: string;
  };

  const getDeeplink = () => {
    if (!shopifyThemeAppExtensionUuid) return null;
    if (!shopname) return null;

    return `https://${shopname}/admin/themes/current/editor?context=apps&activateAppId=${shopifyThemeAppExtensionUuid}/global_component`;
  };

  const openDeepLink = () => {
    const link = getDeeplink();
    if (!link) return;
    console.log("OPENING LINK", link);
    window.open(link, "_blank");
  };

  useEffect(() => {
    if (complete) {
      if (broadcastCompletion) {
        broadcastCompletion();
      }
    }
  }, [data]);

  return (
    <div className="grid w-full py-4 min-h-[100px] place-items-center">
      <div className="flex flex-col gap-1 items-center">
        <Text as="h2" variant="headingMd">
          {complete === true ? "Component Added" : "Add the search component"}
        </Text>
        {!complete && getDeeplink() ? (
          <Button onClick={openDeepLink}>Add to site</Button>
        ) : (
          <CheckIcon
            fill="#2A845A"
            color="#2A845A"
            style={{ height: "50px" }}
          />
        )}
      </div>
    </div>
  );
};
