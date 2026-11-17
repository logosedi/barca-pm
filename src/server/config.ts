/** Public base URL, without a trailing slash. Used in links sent outside the app. */
export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function taskUrl(ref: string) {
  return `${appUrl()}/t/${ref}`;
}

export const integrations = {
  slack: () => Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET),
  shopify: () => Boolean(process.env.SHOPIFY_WEBHOOK_SECRET),
  guru: () => Boolean(process.env.GURU_API_TOKEN),
};
