/**
 * An unknown path. It has to exist: the API returns `index.html` for any extension-less
 * deep link, so without this screen a typo would paint an empty page.
 */
import { Button } from "../components/ui.tsx";
import type { Translate } from "../lib/messages.ts";

export interface NotFoundScreenProps {
  t: Translate;
  onBack(): void;
}

export function NotFoundScreen({ t, onBack }: NotFoundScreenProps) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("route.notFoundTitle")}</h1>
          <p className="page-subtitle">{t("route.notFoundBody")}</p>
        </div>
      </div>
      <div className="card card-message">
        <Button variant="secondary" onClick={onBack}>
          {t("route.backToDashboard")}
        </Button>
      </div>
    </>
  );
}
