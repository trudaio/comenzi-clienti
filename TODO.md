# TODO & Greseli - Clientorders

## Greseli cunoscute
- [ ] product_price = 0 in BigQuery (flatten nu extrage corect pretul din items) — de investigat per connector
- [ ] diogentex.ro — API key 401 (unauthorized), de verificat cu clientul

## De facut in viitor
- [ ] Shopify connector implementation (codul efectiv, nu doar docs)
- [ ] Firebase Hosting deployment
- [ ] Autentificare UI (Firebase Auth)
- [ ] Per-site cron schedule (acum daily status = fix la 5AM pt toata lumea)

## Completate
- [x] Feature 6: Buton Sync All pe Dashboard
- [x] Feature 1: MerchantPro Connector (connector complet cu auth Basic, paginare, flattenOrder)
- [x] Feature 3: BigQuery MERGE/Upsert (staging table → MERGE → drop, fara duplicate)
- [x] Feature 5: Sync History / Cron Log (JSON storage, API endpoint, UI cu History expandable)
- [x] Feature 4: Hourly Sync + Daily Status Update (node-cron, toggle per site, mergeStatusOnly)
- [x] Feature 2: Shopify App Guidance (docs/shopify-setup.md + info block in CredentialForm)
- [x] Adaugat 6 site-uri GoMag (arlight, dualstore, king64, brandoffice, viata-la-tara, farmanatpoieni)
- [x] Adaugat 9 site-uri WooCommerce (ecasnic, soliser, luxuraelite, alevia, specialistulcasei, bambyland, efyra, elesanenergie, bestride)
- [x] Status mapping simplificat: order_processed / order_cancelled
- [x] Filtrat campuri billing/shipping/customer din WooCommerce detect
- [x] Filtrat campuri number/invoice/statusId/payment/shipping/billing din GoMag detect
