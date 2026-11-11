import { createFileRoute } from "@tanstack/react-router";
import { GiftCardAdmin } from "@/components/gift-card-admin";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voucher Desk | Gift Card Admin" },
      { name: "description", content: "Manage gift cards, voucher balances, and transaction history." },
      { property: "og:title", content: "Voucher Desk | Gift Card Admin" },
      { property: "og:description", content: "A secure workspace for gift card and voucher management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" },
    ],
  }),
  component: GiftCardAdmin,
});